import unittest, json, tempfile, io
from pathlib import Path
from unittest.mock import patch
from adapter import postHome

class ConnectionScopeTest(unittest.TestCase):
    def test_scoped_role_endpoint_is_sent_to_exact_local_role(self):
        with tempfile.TemporaryDirectory() as directory:
            file=Path(directory)/'module.json'
            path='/roleplay/4283ed24-1640-4aa4-adb9-10f6a1c77db0/dsh-world/wechat/ask'
            file.write_text(json.dumps(dict(origin='http://127.0.0.1:12345',path=path,token='secret')))
            with patch('adapter.urlopen',return_value=io.BytesIO(b'{"accepted":true}')) as send:
                self.assertTrue(postHome(file,dict(status=dict(wechat='offline')))['accepted'])
                self.assertEqual(send.call_args.args[0].full_url,'http://127.0.0.1:12345'+path)
    def test_remote_and_arbitrary_paths_are_rejected_before_network(self):
        with tempfile.TemporaryDirectory() as directory:
            file=Path(directory)/'module.json'
            for origin,path in [('https://example.com','/dsh-world/wechat/ask'),('http://127.0.0.1','/other'),('http://127.0.0.1','/roleplay/../dsh-world/wechat/ask')]:
                file.write_text(json.dumps(dict(origin=origin,path=path,token='secret')))
                with patch('adapter.urlopen') as send:
                    with self.assertRaises(ValueError):postHome(file,{})
                    send.assert_not_called()
