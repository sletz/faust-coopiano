# The article: pdflatex + bibtex, output faust-coopiano.pdf
PDF = faust-coopiano.pdf
FIGS = ../results/fig_contact.png ../results/fig_notes.png ../results/fig_board.png ../results/fig_engine.png
all: $(PDF)
$(PDF): main.tex references.bib $(FIGS)
	pdflatex -interaction=nonstopmode -halt-on-error main.tex >/dev/null
	bibtex main >/dev/null || true
	pdflatex -interaction=nonstopmode -halt-on-error main.tex >/dev/null
	pdflatex -interaction=nonstopmode -halt-on-error main.tex >/dev/null
	cp main.pdf $(PDF)
clean:
	rm -f main.aux main.bbl main.blg main.log main.out main.pdf
.PHONY: all clean
