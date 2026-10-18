import os, sys, tempfile, unittest, zipfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tbscreen_stream import RangeZipReader, TBscreenError, ensure_cache_capacity, require_terms_acknowledgement, with_transient_member

class RangeZipTests(unittest.TestCase):
    def _reader(self):
        handle = tempfile.NamedTemporaryFile(suffix=".zip", delete=False); handle.close()
        with zipfile.ZipFile(handle.name, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("metadata.csv", "participant_id,label,permission\na,1,yes\n")
            archive.writestr("forced/a.wav", b"audio")
        data=Path(handle.name).read_bytes(); os.unlink(handle.name)
        def fetch(start, end): return data[-end:] if start is None else data[start:end+1]
        return RangeZipReader("memory://fixture", fetch)
    def test_reads_deflated_members(self):
        reader=self._reader(); self.assertEqual(reader.read("forced/a.wav"), b"audio")
    def test_rejects_interrupted_payload(self):
        reader=self._reader(); reader._fetcher=lambda start,end: b"" if start is not None else b"PK\x05\x06"
        with self.assertRaises(TBscreenError): reader.read("forced/a.wav")
    def test_temp_audio_is_removed_after_consumer_failure(self):
        reader=self._reader()
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError): with_transient_member(reader,"forced/a.wav",Path(directory),lambda _: (_ for _ in ()).throw(ValueError()))
            self.assertEqual(list(Path(directory).iterdir()), [])
    def test_cache_limit_stops_work(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(TBscreenError): ensure_cache_capacity(Path(directory), 11, 10)
    def test_terms_are_required_before_any_remote_use(self):
        prior=os.environ.pop("TBSCREEN_DATA_TERMS_CONFIRMED", None)
        try:
            with self.assertRaises(TBscreenError): require_terms_acknowledgement()
        finally:
            if prior is not None: os.environ["TBSCREEN_DATA_TERMS_CONFIRMED"]=prior

if __name__ == "__main__": unittest.main()
