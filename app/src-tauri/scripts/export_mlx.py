#!/usr/bin/env python3
"""
Courtyard - MLX model export script.
Pipeline: fuse LoRA adapter with base model → save as MLX safetensors directory.

The output directory can be loaded directly by LM Studio (MLX native mode)
or served via `python -m mlx_lm.server --model <output_dir>`.

Output: JSON lines to stdout (progress + complete/error events)
"""
import argparse
import json
import os
import sys

from i18n import t, init_i18n, add_lang_arg


def emit(event_type, **kwargs):
    payload = {"type": event_type, **kwargs}
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def resolve_model_path(model_id):
    """Resolve HuggingFace model ID to local cache path if available."""
    if model_id.startswith(("/", "~", ".")):
        expanded = os.path.expanduser(model_id)
        return expanded if os.path.isdir(expanded) else None
    cache_dir = os.path.expanduser("~/.cache/huggingface/hub")
    safe_name = "models--" + model_id.replace("/", "--")
    model_cache = os.path.join(cache_dir, safe_name)
    if os.path.isdir(model_cache):
        snapshots = os.path.join(model_cache, "snapshots")
        if os.path.isdir(snapshots):
            versions = sorted(os.listdir(snapshots))
            if versions:
                return os.path.join(snapshots, versions[-1])
    return model_id


def _dir_size_mb(path):
    """Calculate total size of a directory in MB."""
    total = 0
    for dirpath, _dirnames, filenames in os.walk(path):
        for f in filenames:
            fp = os.path.join(dirpath, f)
            if os.path.isfile(fp):
                total += os.path.getsize(fp)
    return round(total / 1024 / 1024, 1)


def main():
    parser = argparse.ArgumentParser(description="Courtyard MLX model export")
    parser.add_argument("--model", required=True, help="Base model path or HuggingFace ID")
    parser.add_argument("--adapter-path", required=True, help="Path to LoRA adapter directory")
    parser.add_argument("--output-dir", required=True, help="Output directory for fused model")
    add_lang_arg(parser)
    args = parser.parse_args()

    init_i18n(args.lang)

    try:
        _run(args)
    except Exception:
        import traceback
        emit("error", message=f"Unexpected crash: {traceback.format_exc()[-800:]}")
        sys.exit(1)


def _run(args):
    emit("progress", step="check", desc=t("mlx.starting"))

    # Resolve model path
    resolved = resolve_model_path(args.model)
    if resolved is None:
        emit("error", message=t("export.model_not_found", model=args.model))
        sys.exit(1)
    emit("progress", step="resolve", desc=f"Model: {resolved}")

    # Validate adapter
    if not os.path.isdir(args.adapter_path):
        emit("error", message=t("export.adapter_not_found", path=args.adapter_path))
        sys.exit(1)
    adapter_files = [
        f for f in os.listdir(args.adapter_path)
        if f.endswith(".safetensors") or f.endswith(".npz")
    ]
    if not adapter_files:
        emit("error", message=t("export.no_adapter_weights", path=args.adapter_path))
        sys.exit(1)
    emit("progress", step="resolve",
         desc=f"Adapter: {args.adapter_path} ({len(adapter_files)} weight file(s))")

    # Prepare output directory
    output_dir = args.output_dir
    if os.path.isdir(output_dir):
        import shutil
        shutil.rmtree(output_dir, ignore_errors=True)
    os.makedirs(output_dir, exist_ok=True)

    # Fuse adapter with base model using MLX Python API
    emit("progress", step="fuse", desc=t("mlx.fusing"))

    try:
        from pathlib import Path
        from mlx_lm.utils import load, save

        # Load model with adapter
        try:
            result = load(resolved, adapter_path=args.adapter_path, return_config=True)
            model, tokenizer, config = result
        except TypeError:
            model, tokenizer = load(resolved, adapter_path=args.adapter_path)
            config_file = os.path.join(resolved, "config.json")
            with open(config_file, "r") as f:
                config = json.load(f)

        # Fuse LoRA layers
        emit("progress", step="fuse", desc=t("mlx.fusing_lora"))
        from mlx.utils import tree_unflatten
        fused_linears = [
            (n, m.fuse(dequantize=False))
            for n, m in model.named_modules()
            if hasattr(m, "fuse")
        ]
        if fused_linears:
            model.update_modules(tree_unflatten(fused_linears))
            emit("progress", step="fuse",
                 desc=t("mlx.fused_count", count=len(fused_linears)))

        # Save fused model
        emit("progress", step="fuse", desc=t("mlx.saving"))
        save_path = Path(output_dir)
        save(save_path, resolved, model, tokenizer, config, donate_model=False)

    except Exception as e:
        emit("error", message=t("mlx.fuse_fail", error=str(e)[-600:]))
        sys.exit(1)

    # Calculate output size
    size_mb = _dir_size_mb(output_dir)
    emit("progress", step="fuse",
         desc=t("mlx.done", size_mb=size_mb))

    emit("complete",
         output_dir=output_dir,
         size_mb=size_mb)


if __name__ == "__main__":
    main()
