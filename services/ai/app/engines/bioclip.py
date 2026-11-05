"""BioCLIP 2 zero-shot over a species list (docs/AI_INTEGRATION.md). Loaded on first use.

Text embeddings are cached per list, so a changed taxon list is embedded again on its next use.
"""

import hashlib
import io
import threading


class BioClip:
    def __init__(self, model_name: str):
        self.model_name = model_name
        self._lock = threading.Lock()
        self._model = None
        self._text: dict[str, object] = {}

    def _load(self):
        with self._lock:
            if self._model is None:
                import open_clip  # heavy: imported only when needed

                model, _, preprocess = open_clip.create_model_and_transforms(self.model_name)
                model.eval()
                self._model, self._preprocess = model, preprocess
                self._tokenizer = open_clip.get_tokenizer(self.model_name)
        return self._model

    def warm(self) -> None:
        try:
            self._load()
        except Exception:  # reported on first use instead
            pass

    def _text_features(self, names: list[str]):
        import torch

        key = hashlib.sha256("\n".join(names).encode()).hexdigest()
        if key not in self._text:
            model = self._load()
            with torch.no_grad():
                tokens = self._tokenizer([f"a photo of {n}" for n in names])
                f = model.encode_text(tokens)
                self._text = {key: f / f.norm(dim=-1, keepdim=True)}  # keep the latest list only
        return self._text[key]

    def identify(self, images: list[bytes], names: list[str]) -> list[tuple[str, float]]:
        """Softmax over the given names; the image embeddings are averaged."""
        if not names or not images:
            return []
        import torch
        from PIL import Image

        model = self._load()
        text = self._text_features(names)
        with torch.no_grad():
            batch = torch.stack(
                [self._preprocess(Image.open(io.BytesIO(b)).convert("RGB")) for b in images]
            )
            f = model.encode_image(batch)
            f = f / f.norm(dim=-1, keepdim=True)
            f = f.mean(dim=0, keepdim=True)
            f = f / f.norm(dim=-1, keepdim=True)
            probs = (model.logit_scale.exp() * f @ text.T).softmax(dim=-1)[0]
        order = probs.argsort(descending=True)[:10]
        return [(names[i], float(probs[i])) for i in order.tolist()]
