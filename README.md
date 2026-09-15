# arras-research

My arras.io reverse engineering work. Notes, protocol implementations, and
tools I built while picking the game apart.

## Structure

```
arras-research/
├── docs/         notes and specs (protocol, modes, themes)
├── python/       the arras package: client library, protocol, tools
└── javascript/   theme codes, token decoder, localStorage, browser client
```

## Quickstart

The Python client is a library:

```bash
cd python
pip install -e .
python3 examples/basic.py host:8443/5002
```

See [python/README.md](python/README.md) and [python/examples](python/examples).

## Notes

This is for study and interoperability. Not affiliated with arras.io, use at
your own risk.

## License

Apache-2.0. See [LICENSE](LICENSE).

## Star History

<a href="https://www.star-history.com/?repos=zyrafaq%2Farras-research&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=zyrafaq/arras-research&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=zyrafaq/arras-research&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=zyrafaq/arras-research&type=date&legend=top-left" />
 </picture>
</a>
