import http.server
import socketserver
import os

PORT = 3000
os.chdir('.')
Handler = http.server.SimpleHTTPRequestHandler
with socketserver.TCPServer(('', PORT), Handler) as httpd:
    print(f"serving at port {PORT}")
    httpd.serve_forever()
