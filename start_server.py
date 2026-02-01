#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Server don gian de chay du an Giang Sinh
Chay file nay va mo trinh duyet tai http://localhost:8080
"""

import http.server
import socketserver
import os
import webbrowser
from pathlib import Path

PORT = 8080

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        super().end_headers()

def main():
    base_dir = Path(__file__).parent
    os.chdir(base_dir)
    
    Handler = MyHTTPRequestHandler
    
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        url = f"http://localhost:{PORT}/index.html"
        print("=" * 60)
        print("SERVER DA KHOI DONG - MERRY CHRISTMAS!")
        print("=" * 60)
        print(f"\nTruy cap tai: {url}")
        print(f"\nThu muc: {os.getcwd()}")
        print("\nLUU Y:")
        print("   - Cho phep trinh duyet truy cap camera khi duoc hoi")
        print("   - Nhan Ctrl+C de dung server")
        print("\n" + "=" * 60)
        
        try:
            webbrowser.open(url)
            print("\nDa mo trinh duyet tu dong!")
        except:
            print("\nKhong the mo trinh duyet tu dong. Vui long mo thu cong.")
        
        print("\nServer dang chay...\n")
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n\nDang dung server...")
            httpd.shutdown()
            print("Da dung server!")

if __name__ == "__main__":
    main()
