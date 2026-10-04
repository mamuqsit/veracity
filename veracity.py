import asyncio
import base64
import json
import os
import tempfile
from html import escape
from pathlib import Path
from typing import Annotated, Literal

import git
import typer
from browser_use import Agent, Browser, ChatOpenAI
from openai_codex import Codex, CodexConfig, Sandbox
from pydantic import BaseModel, ConfigDict, Field, model_validator
from rich.progress import Progress
from rich.status import Status

app = typer.Typer()

class Test(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9_.-]*$", description="Unique, stable test identifier used for results and screenshot names.")
    group: str = Field(description="Tests sharing one browser session; execute them in plan order.")
    page: str = Field(description="Page or route where this test starts.")
    action: str = Field(description="Specific user actions to perform, in order.")
    expected: str = Field(description="Observable outcome that determines whether the test passes.")

class Plan(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tests: list[Test] = Field(min_length=1, description="Ordered UAT cases covering the repository's user-facing functionality.")

    @model_validator(mode="after")
    def unique_codes(self):
        if len({test.code for test in self.tests}) != len(self.tests):
            raise ValueError("duplicate test codes")
        return self

class Finding(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["succeeded", "skipped", "failed"] = Field(description="succeeded: expected outcome observed; failed: tested but outcome not observed; skipped: could not execute.")
    note: str = Field(description="Observed outcome. This must be exactly 1 concise sentence. If everything went well, keep this empty.")

class Result(Finding):
    code: str = Field(description="Code of the test that produced this result.")
    attachments: list[str] = Field(description="Saved screenshot filenames; empty only for skipped tests.")

def save(path: Path, data: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2) + "\n")
    tmp.replace(path)

@app.callback()
def configure(ctx: typer.Context, model: str = ""):
    ctx.obj = model.removeprefix("openai:")

@app.command()
def audit(ctx: typer.Context, repository: str, output: Path, format: str, branch: str = "", instruction: str = ""):
    if not ctx.obj or format != "json":
        raise typer.BadParameter("--model and json format are required")
    base_url = os.environ["OPENAI_BASE_URL"]
    os.environ["OPENAI_API_KEY"]
    config = CodexConfig(config_overrides=(
        'model_provider="veracity"',
        'model_providers.veracity.name="Veracity"',
        f'model_providers.veracity.base_url={json.dumps(base_url)}',
        'model_providers.veracity.env_key="OPENAI_API_KEY"',
        'model_providers.veracity.wire_api="responses"',
        'model_providers.veracity.supports_websockets=false',
    ))
    with tempfile.TemporaryDirectory() as directory, Status("Cloning repository...") as status:
        git.Repo.clone_from(repository, directory, depth=1, **({"branch": branch} if branch else {}))
        with Codex(config) as codex:
            thread = codex.thread_start(cwd=directory, model=ctx.obj, model_provider="veracity", sandbox=Sandbox.read_only)
            turn = thread.turn(
                "Audit user-facing functionality. Produce ordered UAT tests with unique code, group, page, "
                f"action and expected fields. Do not edit files. {instruction}", output_schema=Plan.model_json_schema())
            final = fallback = None
            status.update("Auditing repository...")
            for event in turn.stream():
                if event.method in ("item/started", "item/completed"):
                    item = event.payload.item.root
                    if item.type == "commandExecution":
                        status.update(f"Inspecting: {item.command.splitlines()[0][:90]}")
                    if event.method == "item/completed" and item.type == "agentMessage":
                        if item.phase is None:
                            fallback = item.text
                        elif getattr(item.phase, "value", item.phase) == "final_answer":
                            final = item.text
                elif event.method == "turn/completed":
                    if event.payload.turn.status.value != "completed":
                        error = event.payload.turn.error
                        raise RuntimeError(error.message if error else f"Audit {event.payload.turn.status.value}")
            save(output, Plan.model_validate_json(final or fallback).model_dump())

async def execute(model: str, website: str, plan: Path, output: Path, workers: int, resume: bool,
                  secrets: list[str], instruction: str, repository: Path):
    tests = Plan.model_validate_json(plan.read_text()).tests
    results = [Result.model_validate(r) for r in json.loads(output.read_text())["results"]] if resume else []
    done = {result.code for result in results}
    if workers < 1 or len(done) != len(results) or not done <= {test.code for test in tests}:
        raise ValueError("invalid workers or resume results")
    credentials = {name: os.environ[name] for name in secrets}
    if not resume:
        save(output, {"results": []})
    screenshots = Path("screenshots")
    screenshots.mkdir(exist_ok=True)
    groups = {test.group: [] for test in tests}
    for test in tests:
        if test.code not in done:
            groups[test.group].append(test)
    limit, lock = asyncio.Semaphore(workers), asyncio.Lock()
    llm = ChatOpenAI(model=model)

    async def group(items, progress, bar):
        async with limit:
            with tempfile.TemporaryDirectory() as directory:
                browser = Browser(headless=True, keep_alive=True, user_data_dir=str(Path(directory) / "profile"),
                                  chromium_sandbox=os.environ.get("GITHUB_ACTIONS") != "true",
                                  enable_default_extensions=False, allowed_domains=[website])
                try:
                    await browser.start()
                    for test in items:
                        agent = Agent(task=f"Test {website}: {test.model_dump_json()}. Report status and note. {instruction}",
                                      llm=llm, browser=browser, output_model_schema=Finding, sensitive_data=credentials,
                                      file_system_path=str(repository.resolve()), flash_mode=True)
                        finding = Finding.model_validate((await agent.run()).structured_output)
                        attachments = []
                        if finding.status != "skipped":
                            image = base64.b64decode(await (await browser.must_get_current_page()).screenshot(), validate=True)
                            if not image.startswith(b"\x89PNG\r\n\x1a\n"):
                                raise ValueError("invalid PNG screenshot")
                            attachments = [f"{test.code}.png"]
                        async with lock:
                            if attachments:
                                (screenshots / attachments[0]).write_bytes(image)
                            results.append(Result(code=test.code, attachments=attachments, **finding.model_dump()))
                            save(output, {"results": [result.model_dump() for result in results]})
                            progress.advance(bar)
                finally:
                    await browser.kill()

    with Progress() as progress:
        bar = progress.add_task("UAT", total=len(tests), completed=len(results))
        await asyncio.gather(*(group(items, progress, bar) for items in groups.values() if items))
    if {result.code for result in results} != {test.code for test in tests}:
        raise ValueError("incomplete UAT results")

@app.command()
def run(ctx: typer.Context, website: str, plan: Path, output: Annotated[Path, typer.Option()],
        repository: Annotated[str, typer.Option()], branch: str = "", workers: int = 4, resume: bool = False,
        secret: Annotated[list[str] | None, typer.Option()] = None, instruction: str = ""):
    if not ctx.obj:
        raise typer.BadParameter("--model is required")
    with tempfile.TemporaryDirectory() as directory:
        git.Repo.clone_from(repository, directory, depth=1, **({"branch": branch} if branch else {}))
        asyncio.run(execute(ctx.obj, website, plan, output, workers, resume, secret or [], instruction,
                            Path(directory)))

@app.command()
def html(source: Path, output: Path,
         status: Annotated[list[str] | None, typer.Option()] = None):
    status = status or []
    if set(status) - {"succeeded", "skipped", "failed"}:
        raise typer.BadParameter("invalid status")
    rows = []
    for entry in json.loads(source.read_text())["results"]:
        result = Result.model_validate(entry)
        if status and result.status not in status:
            continue
        images = []
        for name in result.attachments:
            image = base64.b64encode((source.parent / "screenshots" / name).read_bytes()).decode()
            images.append(f'<img alt="{escape(name)}" src="data:image/png;base64,{image}">')
        cells = "".join(f"<td>{escape(getattr(result, key))}</td>" for key in ("code", "status", "note"))
        rows.append(f'<tr>{cells}<td>{"".join(images)}</td></tr>')
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        '<!doctype html><html lang="en"><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        '<title>Veracity UAT report</title><style>'
        'body{font-family:system-ui;margin:2rem}table{border-collapse:collapse;width:100%}'
        'th,td{border:1px solid #ccc;padding:.75rem;text-align:left;vertical-align:top;white-space:pre-wrap}'
        'img{display:block;max-width:100%;max-height:32rem;margin-bottom:.5rem}'
        '</style><h1>Veracity UAT report</h1><table><thead><tr>'
        '<th>Code</th><th>Status</th><th>Note</th><th>Screenshots</th>'
        '</tr></thead><tbody>' + "\n".join(rows) + '</tbody></table></html>\n', encoding="utf-8")

if __name__ == "__main__":
    app()
