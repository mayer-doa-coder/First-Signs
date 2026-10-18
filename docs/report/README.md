# First Signs IEEE report

The report uses the IEEEtran class in explicit one-column mode.

Compile from this directory with a TeX distribution that includes `IEEEtran`, `TikZ`, and BibTeX:

```text
pdflatex first-signs-ieee-report.tex
bibtex first-signs-ieee-report
pdflatex first-signs-ieee-report.tex
pdflatex first-signs-ieee-report.tex
```

The report references repository-owned images from `docs/images/`. A compiled copy is available as `first-signs-ieee-report.pdf`.

The PDF was generated with the official Tectonic 0.17.0 Windows release. Tectonic handles the required bibliography passes automatically:

```text
tectonic first-signs-ieee-report.tex
```
