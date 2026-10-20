#!/usr/bin/env python3
"""Validate entry assets, bundled dependencies, and complete split CLIP model."""
import argparse, hashlib, json, re
from pathlib import Path

def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()

def main():
    base=Path(__file__).resolve().parents[1]
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--site',type=Path,default=base/'assets'/'site')
    parser.add_argument('--write-manifest',action='store_true')
    args=parser.parse_args();site=args.site.resolve()
    html=(site/'index.html').read_text(encoding='utf-8-sig')
    ids=re.findall(r'\bid="([^" ]+)"',html)
    assert len(ids)==len(set(ids)), 'Duplicate HTML IDs'
    for url in re.findall(r'(?:src|href)="([^"?#]+)',html):
        if not url.startswith(('https:','http:','data:','#')):assert (site/url).is_file(),url
    assert 'id="destination-tabs"' in html and 'src="board.js' not in html, 'Single-building navigation required'
    spec=json.loads((site/'models/clip-parts.json').read_text())
    h=hashlib.sha256();size=0
    for name in spec['parts']:
        p=site/'models/Xenova/clip-vit-base-patch32/onnx'/name
        with p.open('rb') as f:
            for block in iter(lambda:f.read(1024*1024),b''):size+=len(block);h.update(block)
    assert size==spec['size'] and h.hexdigest()==spec['sha256'], 'Incomplete or changed model'
    for path in ['models/hand_landmarker.task','vendor/vision-global.js','vendor/mediapipe/vision_wasm_internal.wasm','vendor/onnx/ort-wasm-simd.wasm','assets/roofs-v2.png','assets/photos-v2.png']:
        assert (site/path).is_file(),path
    catalog=(site/'building-catalog.js').read_text(encoding='utf-8-sig')
    for url in re.findall(r'"src"\s*:\s*"([^"]+)"',catalog):assert (site/url).is_file(),url
    files={p.relative_to(site).as_posix():digest(p) for p in sorted(site.rglob('*')) if p.is_file()}
    manifest=base/'references/site-sha256.json'
    if args.write_manifest:manifest.write_text(json.dumps(files,indent=2)+'\n',encoding='utf-8')
    else:assert json.loads(manifest.read_text())==files, 'Template changed; inspect differences before updating manifest'
    assert all((site/n).stat().st_size<100*1024*1024 for n in files), 'Split large files before Git upload'
    print('PASS:',len(files),'files; HTML dependencies; complete CLIP SHA256',h.hexdigest())

if __name__=='__main__':main()
