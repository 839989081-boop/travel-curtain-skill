#!/usr/bin/env python3
"""Loopback HTTP preview; use HTTPS hosting for public camera access."""
import argparse, functools
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--site',type=Path,default=Path(__file__).resolve().parents[1]/'assets'/'site')
    parser.add_argument('--port',type=int,default=8877)
    args=parser.parse_args();site=args.site.expanduser().resolve()
    if not (site/'index.html').is_file(): parser.error('Site root must contain index.html.')
    if not 1<=args.port<=65535: parser.error('Port must be between 1 and 65535.')
    handler=functools.partial(SimpleHTTPRequestHandler,directory=str(site))
    with ThreadingHTTPServer(('127.0.0.1',args.port),handler) as server:
        print('Preview: http://127.0.0.1:'+str(args.port)+'/',flush=True)
        try: server.serve_forever()
        except KeyboardInterrupt: pass

if __name__=='__main__':main()
