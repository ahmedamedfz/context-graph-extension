# Bundled components

- IBM Granite 4.2 3B GGUF, Q4_K_M. Publisher: IBM Granite. Apache License 2.0; full text in `resources/granite/MODEL-LICENSE.txt`. Source and model card: https://huggingface.co/ibm-granite/granite-4.2-3b-GGUF and https://huggingface.co/ibm-granite/granite-4.2-3b. Model revision, byte size and SHA-256 are recorded in `resources/granite/manifest.json`.
- llama.cpp b11206, macOS arm64. Copyright 2023–2026 The ggml authors. MIT; full upstream license in `resources/granite/runtime/LICENSE`. Source: https://github.com/ggml-org/llama.cpp/tree/b11206. The runtime and its dynamic libraries are redistributed without modification.
- Bundled JavaScript dependencies retain upstream license comments in `dist/extension.js`. YAML is ISC licensed, axios is MIT licensed. Sources: https://github.com/eemeli/yaml and https://github.com/axios/axios.

The model and runtime are downloaded and verified during packaging. Users of the resulting offline VSIX do not download them on activation. No cloud inference request is made when using the local provider.
