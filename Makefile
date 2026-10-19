# coopiano, the physically modelled piano of piano.hpp, in Faust (faust-rs).
#
#   make help        this text (also what a bare `make` prints)
#   make ref         build ref/dump.cpp against coopiano's headers and extract the
#                    reference tables and renders into build/ref (about 20 s)
#   make tables      dsp/coopiano_tables.lib from build/ref (soundboard fit included)
#   make check       compile every program with faustprobe, and run the instrument
#                    polyphonically with its body (`effect`)
#   make doctests    compile every `#### Test` of dsp/coopiano.lib (~10 min)
#   make contact     hammer contact of the Faust voice against prep_note
#   make notes       the Faust voice against render_bridge_force, key by key
#   make keyboard    the same for every key A0-C8 (88 renders of each model, ~5 min)
#   make engine      one key through the whole instrument against coopiano's Engine
#   make test        contact + notes + engine
#   make render [SCORE=scores/demo.txt] [VOICES=16] [LIGHT=1]
#                    native offline render of a score (build/render: the voice and the
#                    body compiled to C++ by faust-rs, then clang -O3); writes build/OUT.wav;
#                    LIGHT=1 uses the body without the soundboard's imaging
#   make results     run every comparison and the cost measure, write results/*.txt (~30 min)
#   make paper       the article, paper/faust-coopiano.pdf (pdflatex + bibtex)
#   make web         the web version: the voice and both bodies compiled to wasm by
#                    faust-rs into web/dsp (about 20 s); make -B web after a faust-rs
#                    change (the modules are versioned and depend on dsp/ only)
#   make web-check   the wasm DSPs against faustprobe, and their cost (node)
#   make web-serve [PORT=8000]
#                    serve the repository and open http://localhost:PORT/web/
#   make pianoteq    coopiano (C++ and Faust) against Pianoteq 9 on the same scores: renders
#                    into build/pianoteq, then pianoteq/results.txt and figures (~13 min;
#                    run scripts/pianoteq_preset.sh once first, see pianoteq/README.md)
#   make clean       remove build/
#   JOBS=n           renders run side by side by contact, notes and keyboard (default 4;
#                    a faust-rs compilation of the voice peaks at about 3 GB)
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
JOBS ?= 4
export JOBS
PORT ?= 8000
WEB_DSP = web/dsp
NATIVE ?= -O3 -ffast-math -march=native

.PHONY: help ref tables check doctests contact notes keyboard engine test render results figures paper web web-check web-serve pianoteq clean
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
	@$(FAUSTPROBE) --double -I dsp --nvoices 2 --note 60:100@0 --note 64:90@2205 -n 4410 --quiet dsp/coopiano.dsp > /dev/null \
	  && echo "ok   dsp/coopiano.dsp, 2 voices through the body" || { echo "FAIL dsp/coopiano.dsp, 2 voices through the body"; exit 1; }

doctests:
	@mkdir -p build
	$(PYTHON) scripts/check_doc_tests.py

contact:
	$(PYTHON) scripts/compare_contact.py

notes:
	$(PYTHON) scripts/compare_notes.py --jobs $(JOBS)

build/ref_keys/draws.txt: build/dump
	@mkdir -p build/ref_keys
	./build/dump build/ref_keys keys

keyboard: build/ref_keys/draws.txt
	$(PYTHON) scripts/compare_notes.py --ref build/ref_keys --jobs $(JOBS)

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

results: build/ref_keys/draws.txt
	@mkdir -p results
	$(PYTHON) scripts/compare_contact.py | tee results/contact.txt
	$(PYTHON) scripts/compare_notes.py --jobs $(JOBS) | tee results/notes.txt
	$(PYTHON) scripts/compare_notes.py --ref build/ref_keys --jobs $(JOBS) | tee results/keyboard.txt
	$(PYTHON) scripts/compare_engine.py | tee results/engine.txt
	$(PYTHON) scripts/board_fit_report.py | tee results/board.txt
	./scripts/cost.sh | tee results/cost.txt

figures:
	$(PYTHON) scripts/figures.py

paper: figures
	$(MAKE) -C paper

# The web version: the voice is `process` of dsp/coopiano.dsp, the bodies its
# `effect` and the one of dsp/coopiano_light.dsp, in single precision (WEB_PRECISION
# = -double for the precision of the native build).
WEB_DEPS = dsp/coopiano.lib dsp/coopiano_tables.lib
WEB_PRECISION ?= -single

$(WEB_DSP)/voice.wasm: dsp/coopiano.dsp $(WEB_DEPS)
	@mkdir -p $(WEB_DSP)
	$(FAUSTRS) -lang wasm $(WEB_PRECISION) --timeout 0 -I dsp dsp/coopiano.dsp -o $@

$(WEB_DSP)/body.wasm: dsp/coopiano.dsp $(WEB_DEPS)
	@mkdir -p $(WEB_DSP)
	$(FAUSTRS) -lang wasm $(WEB_PRECISION) --timeout 0 -I dsp -pn effect dsp/coopiano.dsp -o $@

$(WEB_DSP)/body_light.wasm: dsp/coopiano_light.dsp $(WEB_DEPS)
	@mkdir -p $(WEB_DSP)
	$(FAUSTRS) -lang wasm $(WEB_PRECISION) --timeout 0 -I dsp -pn effect dsp/coopiano_light.dsp -o $@

web: $(WEB_DSP)/voice.wasm $(WEB_DSP)/body.wasm $(WEB_DSP)/body_light.wasm

web-check: web
	node scripts/web_check.mjs

web-serve: web
	$(PYTHON) scripts/web_serve.py $(PORT)

pianoteq:
	COOPIANO=$(COOPIANO) ./scripts/pianoteq_render.sh
	$(PYTHON) scripts/pianoteq_analyze.py

clean:
	rm -rf build $(WEB_DSP)
