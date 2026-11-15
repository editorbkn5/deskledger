from http.client import HTTPConnection
import json
from pathlib import Path
import tempfile
from threading import Thread
import unittest

from deskledger.server import create_server
from test_store import config


class HTTPTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.server = create_server(Path(directory.name) / "http.db")
        worker = Thread(target=self.server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)
        worker.start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)
        self.origin = "http://" + self.server.authority

    def request(self, verb, route, data=None, **headers):
        connection = HTTPConnection("127.0.0.1", self.server.server_port, timeout=5)
        try:
            connection.request(verb, route, body=data, headers=headers)
            result = connection.getresponse()
            return result.status, result.read(), dict(result.getheaders())
        finally:
            connection.close()

    def test_local_assets_and_headers(self):
        for route in ("/", "/app.js", "/i18n.js", "/style.css"):
            with self.subTest(route=route):
                status, body, headers = self.request("GET", route)
                self.assertEqual(status, 200)
                self.assertTrue(body)
                self.assertIn("frame-ancestors 'none'", headers["Content-Security-Policy"])
                self.assertEqual(headers["Cache-Control"], "no-store")

    def test_read_and_write_host_and_origin(self):
        self.assertEqual(self.request("GET", "/api/state", Host="foreign.invalid")[0], 403)
        self.assertEqual(self.request("GET", "/api/state")[0], 403)
        token = self.server.token
        body = json.dumps(config())
        headers = {"Content-Type": "application/json", "X-DeskLedger-Token": token}
        self.assertEqual(self.request("POST", "/api/settings", body, **headers)[0], 403)
        self.assertEqual(self.request("POST", "/api/settings", body, Origin="https://foreign.invalid", **headers)[0], 403)
        self.assertEqual(self.request("POST", "/api/settings", body, Origin=self.origin, **headers)[0], 200)
        status, state, _ = self.request("GET", "/api/state", **headers)
        self.assertEqual(status, 200)
        self.assertEqual(set(json.loads(state)), {"state"})

    def test_malformed_requests_and_unknown_routes(self):
        headers = {"Content-Type": "application/json", "X-DeskLedger-Token": self.server.token, "Origin": self.origin}
        for payload in ("[]", "{broken", "null"):
            self.assertEqual(self.request("POST", "/api/settings", payload, **headers)[0], 400)
        self.assertEqual(self.request("POST", "/api/unknown", "{}", **headers)[0], 404)
        self.assertEqual(self.request("GET", "/unknown")[0], 404)


if __name__ == "__main__":
    unittest.main()
