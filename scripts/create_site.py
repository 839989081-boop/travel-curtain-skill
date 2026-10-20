#!/usr/bin/env python3
"""Copy a self-contained static site without overwriting existing user files."""
import argparse, shutil
from pathlib import Path

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',required=True,type=Path)
    args=parser.parse_args()
    source=Path(__file__).resolve().parents[1]/'assets'/'site'
    target=args.output.expanduser().resolve()
    if target==source or source in target.parents or target in source.parents:
        parser.error('Choose an output outside the bundled template.')
    if target.exists() and (not target.is_dir() or any(target.iterdir())):
        parser.error('Output must be absent or an empty directory; existing files are preserved.')
    shutil.copytree(source,target,dirs_exist_ok=True)
    print('Created static website:',target)
    print('Preview: python scripts/preview.py --site "'+str(target)+'" --port 8877')

if __name__=='__main__': main()
