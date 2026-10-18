# First Signs IEEE report

The report uses the IEEEtran class in explicit one-column mode.

Compile from this directory with a TeX distribution that includes `IEEEtran`, `TikZ`, and BibTeX:

```text
pdflatex first-signs-ieee-report.tex
bibtex first-signs-ieee-report
pdflatex first-signs-ieee-report.tex
pdflatex first-signs-ieee-report.tex
```

The report references repository-owned images from `docs/images/`. No generated PDF is committed by this change.
