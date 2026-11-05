FROM python:3.11-slim
WORKDIR /srv
COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch \
 && pip install --no-cache-dir ".[bioclip]"
# Download the BioCLIP 2 weights at build time so the first request is not slow.
RUN python -c "import open_clip; open_clip.create_model_and_transforms('hf-hub:imageomics/bioclip-2')"
EXPOSE 8088
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8088"]
