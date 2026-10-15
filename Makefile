# coopiano, the physically modelled piano of piano.hpp, in Faust (faust-rs).
#
#   make help        this text (also what a bare `make` prints)
#   make ref         build ref/dump.cpp against coopiano's headers and extract the
#                    reference tables and renders into build/ref (about 20 s)
#   make tables      dsp/coopiano_tables.lib from build/ref (soundboard fit included)
#   make check       compile every program with faustprobe
#   make contact     hammer contact of the Faust voice against prep_note
#   make notes       the Faust voice against render_bridge_force, key by key
#   make engine      one key through the whole instrument against coopiano's Engine
#   make test        contact + notes + engine
#   make render [SCORE=scores/demo.txt] [VOICES=16] [LIGHT=1]
#                    native offline render of a score (build/render: the voice and the
#                    body compiled to C++ by faust-rs, then clang -O3); writes build/OUT.wav;
#                    LIGHT=1 uses the body without the soundboard's imaging
#   make results     run every comparison and the cost measure, write results/*.txt (~30 min)
#   make paper       the article, paper/faust-coopiano.pdf (pdflatex + bibtex)
#   make clean       remove build/
#
# COOPIANO points to the coopiano checkout (piano.hpp, instrument.hpp);
# FAUST_RS to a faust-rs checkout with release faust-rs and faustprobe built.

COOPIANO ?= ../../coopiano
FAUST_RS ?= ../faust-rs
FAUSTPROBE ?= $(FAUST_RS)/target/release/faustprobe
FAUSTRS ?= $(FAUST_RS)/target/release/faust-rs
CXX ?= c++
PYTHON ?= python3
export FAUSTPROBE

SCORE ?= scores/demo.txt
LIGHT ?=
BODY_DSP = $(if $(LIGHT),dsp/coopiano_body_light.dsp,dsp/coopiano_body.dsp)
RENDER_DIR = build/$(if $(LIGHT),light,full)
VOICES ?= 16
NATIVE ?= -O3 -ffast-math -march=native

.PHONY: help ref tables check contact notes engine test render results figures paper clean
help:
	@sed -n '1,/^$$/p' Makefile | sed 's/^# \{0,1\}//'

build/dump: ref/dump.cpp
	@mkdir -p build
	$(CXX) -O2 -std=c++17 -I $(COOPIANO) ref/dump.cpp -o $@

ref: build/dump
	@mkdir -p build/ref
	./build/dump build/ref all

tables:
	$(PYTHON) scripts/gen_tables.py build/ref dsp/coopiano_tables.lib

check:
	@for f in dsp/coopiano_note.dsp dsp/coopiano_hammer.dsp dsp/coopiano_voice_out.dsp dsp/coopiano_body.dsp dsp/coopiano_body_light.dsp dsp/coopiano.dsp dsp/coopiano_light.dsp; do \
	  $(FAUSTPROBE) --double -I dsp -n 1 --in zero --quiet $$f > /dev/null && echo "ok   $$f" || { echo "FAIL $$f"; exit 1; }; done

contact:
	$(PYTHON) scripts/compare_contact.py

notes:
	$(PYTHON) scripts/compare_notes.py

test: contact notes engine

engine:
	$(PYTHON) scripts/compare_engine.py

$(RENDER_DIR)/coopiano_voice.cpp: dsp/coopiano.dsp dsp/coopiano.lib dsp/coopiano_tables.lib
	@mkdir -p $(RENDER_DIR)
	$(FAUSTRS) -double --timeout 0 -cn coopiano_voice -I dsp dsp/coopiano.dsp -o $@

$(RENDER_DIR)/coopiano_body.cpp: $(BODY_DSP) dsp/coopiano.lib dsp/coopiano_tables.lib
	@mkdir -p $(RENDER_DIR)
	$(FAUSTRS) -double --timeout 0 -cn coopiano_body -I dsp $(BODY_DSP) -o $@

build/full/render build/light/render: tools/render.cpp
$(RENDER_DIR)/render: tools/render.cpp $(RENDER_DIR)/coopiano_voice.cpp $(RENDER_DIR)/coopiano_body.cpp
	$(CXX) -std=c++17 $(NATIVE) -I $(RENDER_DIR) tools/render.cpp -o $@

render: $(RENDER_DIR)/render
	$(RENDER_DIR)/render $(SCORE) build/$(basename $(notdir $(SCORE)))$(if $(LIGHT),_light).wav $(VOICES)

results:
	@mkdir -p results
	$(PYTHON) scripts/compare_contact.py | tee results/contact.txt
	$(PYTHON) scripts/compare_notes.py | tee results/notes.txt
	$(PYTHON) scripts/compare_engine.py | tee results/engine.txt
	$(PYTHON) scripts/board_fit_report.py | tee results/board.txt
	./scripts/cost.sh | tee results/cost.txt

figures:
	$(PYTHON) scripts/figures.py

paper: figures
	$(MAKE) -C paper

clean:
	rm -rf build
