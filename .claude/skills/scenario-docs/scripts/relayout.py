#!/usr/bin/env python3
"""Put every generated help page where the config says it belongs, without re-running anything.

Usage (from the repo root):
    python3 relayout.py                 move pages and images, write the group headings, fix links
    python3 relayout.py --check         only report what would change (exit 1 if anything would)
    python3 relayout.py --where <id>    print where <id>'s page belongs (path and URL), change nothing

Options: --config <path to scenario-docs.yml> (default documentation/scenarios/scenario-docs.yml).

Where a page goes (config.md, "Audiences and sections"):
    <docs_dir>/<audience>/<section path>/<id>.mdx, images in img/<id>/ beside it
The audience comes from the scenario's persona; the section path is the scenario's `section:`
(e.g. integrations/xero/products). An overview (kind: overview) goes in <docs_dir> itself.
Each page's front matter gets `slug: /<audience>/<id>` (so moving a page between sections
never changes its URL) and `sidebar_position` from the scenario's `order:`.

It also writes a _category_.json for every section that has pages (label, position,
collapsed, and a landing page when the section has a description), removes headings and
folders left empty, rewrites links between pages to their new relative paths, writes
<docs_dir>/_audiences.json (the help site builds one sidebar and one top-menu item per entry),
and refreshes the audience list on the home page between its audiences:start/end markers.
Pages whose scenario has no page yet are skipped. Needs PyYAML.
"""
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

import yaml

FM = re.compile(r"^---\n(.*?)\n---\n", re.S)
LINK = re.compile(r"(?<!!)\]\(((?:\.{1,2}/)(?:[^)#\s]*/)?([\w-]+)\.mdx?)(#[^)\s]*)?\)")
MARK_START = "{/* audiences:start */}"
MARK_END = "{/* audiences:end */}"


def fail(msg):
    print(f"ERROR  {msg}")
    sys.exit(2)


def front_matter(path):
    m = FM.match(path.read_text(encoding="utf-8"))
    return (yaml.safe_load(m.group(1)) or {}) if m else {}


def load(config_path):
    cfg = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    scen_dir = config_path.parent
    docs_dir = Path(cfg["docs_dir"])
    audiences = cfg.get("audiences") or []
    personas = cfg.get("personas") or {}
    default_persona = cfg.get("default_persona")

    # Section tree per audience: path -> (labels, position, collapsed, description)
    tree = {}
    for ai, aud in enumerate(audiences):
        def walk(sections, prefix):
            for si, sec in enumerate(sections or []):
                path = f"{prefix}/{sec['id']}" if prefix else sec["id"]
                tree[(aud["id"], path)] = {
                    "label": sec["label"],
                    "position": si + 1,
                    "collapsed": sec.get("collapsed", True),
                    "description": sec.get("description"),
                }
                walk(sec.get("sections"), path)
        walk(aud.get("sections"), "")

    files = [p for p in sorted(scen_dir.glob("*.md")) if not p.name.startswith("_") and p.name != "README.md"]
    files += sorted((scen_dir / "guides").glob("*.md")) if (scen_dir / "guides").is_dir() else []
    targets = {}
    for f in files:
        fm = front_matter(f)
        sid = f.stem
        if fm.get("kind") == "overview" or not audiences:
            # Single-audience projects (no `audiences`) keep the older layout: <docs_dir>/[<section>/]<id>.mdx
            sec = fm.get("section") if not fm.get("kind") == "overview" else None
            d = docs_dir / sec if sec else docs_dir
            targets[sid] = {"dir": d, "slug": None, "order": fm.get("order"), "audience": None, "section": sec}
            continue
        persona = fm.get("persona") or default_persona
        if persona not in personas:
            fail(f"{f}: persona {persona!r} isn't in the config.")
        aud = personas[persona].get("audience")
        if not aud or aud not in {a["id"] for a in audiences}:
            fail(f"{f}: persona {persona!r} has no audience from the config's audiences.")
        sec = fm.get("section")
        if sec and (aud, sec) not in tree:
            fail(f"{f}: section {sec!r} isn't one of {aud}'s sections in the config.")
        d = docs_dir / aud / sec if sec else docs_dir / aud
        targets[sid] = {"dir": d, "slug": f"/{aud}/{sid}", "order": fm.get("order"),
                        "audience": aud, "section": sec}
    return cfg, docs_dir, audiences, tree, targets


def tracked(path):
    r = subprocess.run(["git", "ls-files", "--error-unmatch", str(path)], capture_output=True)
    return r.returncode == 0


def move(src, dst, changes, dry):
    if src.resolve() == dst.resolve():
        return
    changes.append(f"move {src} -> {dst}")
    if dry:
        return
    dst.parent.mkdir(parents=True, exist_ok=True)
    if tracked(src):
        subprocess.run(["git", "mv", str(src), str(dst)], check=True)
    else:
        shutil.move(str(src), str(dst))


def set_front_matter(page, slug, order, changes, dry):
    text = page.read_text(encoding="utf-8")
    m = FM.match(text)
    if not m:
        return
    lines = [l for l in m.group(1).split("\n") if not re.match(r"^(slug|sidebar_position):", l)]
    extra = []
    if slug:
        extra.append(f"slug: {slug}")
    if order is not None:
        extra.append(f"sidebar_position: {order}")
    # keep them right after sidebar_label (or title)
    at = next((i + 1 for i, l in enumerate(lines) if l.startswith("sidebar_label:")),
              next((i + 1 for i, l in enumerate(lines) if l.startswith("title:")), len(lines)))
    lines[at:at] = extra
    new = "---\n" + "\n".join(lines) + "\n---\n" + text[m.end():]
    if new != text:
        changes.append(f"front matter {page}")
        if not dry:
            page.write_text(new, encoding="utf-8")


def sort_key(info, tree, audiences):
    aud_ids = [a["id"] for a in audiences]
    key = [aud_ids.index(info["audience"]) if info["audience"] in aud_ids else -1]
    parts = (info["section"] or "").split("/") if info["section"] else []
    for i in range(len(parts)):
        key.append(tree[(info["audience"], "/".join(parts[: i + 1]))]["position"])
    key.append(999 if info["order"] is None else info["order"])
    return key


def main(argv):
    args = argv[1:]
    dry = "--check" in args
    config = Path("documentation/scenarios/scenario-docs.yml")
    if "--config" in args:
        config = Path(args[args.index("--config") + 1])
    cfg, docs_dir, audiences, tree, targets = load(config)

    if "--where" in args:
        sid = args[args.index("--where") + 1]
        if sid not in targets:
            fail(f"no scenario or guide called {sid}.")
        t = targets[sid]
        print(t["dir"] / f"{sid}.mdx")
        print(f"url: {t['slug'] or '(by path)'}")
        return 0

    changes = []
    pages = {}  # id -> current page path, for every generated page found
    for p in docs_dir.rglob("*.mdx"):
        if "node_modules" in p.parts or p.stem not in targets:
            continue
        if p.stem in pages:
            fail(f"two pages for {p.stem}: {pages[p.stem]} and {p}.")
        pages[p.stem] = p

    # 1. Move pages and their images.
    for sid, page in sorted(pages.items()):
        t = targets[sid]
        dst = t["dir"] / f"{sid}.mdx"
        move(page, dst, changes, dry)
        img_src, img_dst = page.parent / "img" / sid, t["dir"] / "img" / sid
        if img_src.is_dir():
            move(img_src, img_dst, changes, dry)
        if not dry:
            pages[sid] = dst
            set_front_matter(dst, t["slug"], t["order"], changes, dry)

    # 2. Rewrite links between pages to the new relative paths.
    every_page = [p for p in docs_dir.rglob("*.md*") if p.suffix in (".md", ".mdx") and "node_modules" not in p.parts]
    for p in every_page:
        text = p.read_text(encoding="utf-8")

        def fix(m):
            sid = m.group(2)
            if sid not in pages:
                return m.group(0)
            dest = (targets[sid]["dir"] / f"{sid}.mdx") if dry else pages[sid]
            rel = os.path.relpath(dest, p.parent).replace(os.sep, "/")
            if not rel.startswith("."):
                rel = "./" + rel
            return f"]({rel}{m.group(3) or ''})"

        new = LINK.sub(fix, text)
        if new != text:
            changes.append(f"links {p}")
            if not dry:
                p.write_text(new, encoding="utf-8")

    # 3. Section headings: a _category_.json for each section that has pages.
    used = set()
    for sid in pages:
        t = targets[sid]
        if t["audience"] and t["section"]:
            parts = t["section"].split("/")
            for i in range(len(parts)):
                used.add((t["audience"], "/".join(parts[: i + 1])))
    wanted = {}
    for aud, path in used:
        s = tree[(aud, path)]
        cat = {"label": s["label"], "position": s["position"], "collapsed": s["collapsed"]}
        if s["description"]:
            cat["link"] = {"type": "generated-index", "slug": f"/{aud}/{path}",
                           "description": " ".join(s["description"].split())}
        wanted[docs_dir / aud / path / "_category_.json"] = json.dumps(cat, indent=2, ensure_ascii=False) + "\n"
    for f, body in sorted(wanted.items()):
        if not f.exists() or f.read_text(encoding="utf-8") != body:
            changes.append(f"heading {f}")
            if not dry:
                f.parent.mkdir(parents=True, exist_ok=True)
                f.write_text(body, encoding="utf-8")
    for f in docs_dir.rglob("_category_.json"):
        if f not in wanted and "node_modules" not in f.parts:
            changes.append(f"remove heading {f}")
            if not dry:
                f.unlink()
    if not dry:
        for d in sorted((d for d in docs_dir.rglob("*") if d.is_dir()), key=lambda d: -len(d.parts)):
            if not any(d.iterdir()):
                d.rmdir()

    # 4. Audiences with pages: sidebars, top menu, home page list.
    listed = []
    for aud in audiences:
        mine = [sid for sid in pages if targets[sid]["audience"] == aud["id"]]
        if not mine:
            continue
        first = min(mine, key=lambda s: sort_key(targets[s], tree, audiences) + [s])
        listed.append({"id": aud["id"], "label": aud["label"],
                       "first": os.path.relpath(targets[first]["dir"] / f"{first}.mdx", docs_dir).replace(os.sep, "/")})
    if audiences:
        aj = docs_dir / "_audiences.json"
        body = json.dumps(listed, indent=2, ensure_ascii=False) + "\n"
        if not aj.exists() or aj.read_text(encoding="utf-8") != body:
            changes.append(f"write {aj}")
            if not dry:
                aj.write_text(body, encoding="utf-8")
        home = docs_dir / "index.mdx"
        if home.exists():
            text = home.read_text(encoding="utf-8")
            if MARK_START in text and MARK_END in text:
                items = "\n".join(f"- [{a['label']}](./{a['first']})" for a in listed)
                new = text[: text.index(MARK_START) + len(MARK_START)] + "\n\n" + items + "\n\n" + text[text.index(MARK_END):]
                if new != text:
                    changes.append(f"home page list {home}")
                    if not dry:
                        home.write_text(new, encoding="utf-8")

    for c in changes:
        print(("WOULD " if dry else "") + c)
    if not changes:
        print("Layout already matches the config.")
    return 1 if (dry and changes) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
