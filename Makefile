.DEFAULT_GOAL := help

MODE ?= menu
export MODE OPEN QUERY

ifeq ($(shell uname -s),Darwin)
# Vite otherwise looks for a running Chromium browser before using the macOS default.
BROWSER ?= open
export BROWSER
endif

.PHONY: help install dev preview build check test verify clean benchmark benchmark-check patch minor major version

help:
	@printf '%s\n' \
	  'make install          Install dependencies from the lockfile' \
	  'make dev              Start Vite and open the main menu' \
	  '  MODE=story          Open the in-game Story desk' \
	  '  MODE=desk           Open the standalone desk sandbox' \
	  '  MODE=boxes          Open the desk sandbox with layout boxes' \
	  '  MODE=flight         Skip the menu and start Free Fly' \
	  '  MODE=debug          Open the main menu with diagnostics' \
	  '  QUERY="a=1&b=2"     Add URL parameters to the selected mode' \
	  '  OPEN="/custom"      Open a custom route in place of the mode route' \
	  '  BROWSER=none       Start without opening a browser' \
	  '  ARGS="--port 5174"  Forward extra Vite flags' \
	  'make preview          Serve the production build' \
	  'make build            Type-check and build into dist/' \
	  'make check / test     Type-check and run the tests' \
	  'make verify           Run checks, benchmark comparison, and build' \
	  'make benchmark        Show current performance timings' \
	  'make benchmark-check  Compare performance with the checked-in baseline' \
	  'make clean            Remove dist/' \
	  'make version          Print the package version' \
	  'make patch/minor/major  Bump the package and lockfile version without tagging'

install:
	npm ci

dev:
	@case "$$MODE" in \
	  menu) route='/' ;; \
	  story) route='/?story' ;; \
	  desk) route='/story.html' ;; \
	  boxes) route='/story.html?boxes' ;; \
	  flight) route='/?play' ;; \
	  debug) route='/?debug' ;; \
	  *) printf 'Unknown dev mode: %s. See make help.\n' "$$MODE" >&2; exit 2 ;; \
	esac; \
	route=$${OPEN:-$$route}; \
	if [ -n "$$QUERY" ]; then \
	  case "$$route" in \
	    *\?*) route="$$route&$$QUERY" ;; \
	    *) route="$$route?$$QUERY" ;; \
	  esac; \
	fi; \
	exec npm run dev -- --open "$$route" $(ARGS)

preview build check verify benchmark:
	npm run $@

test: check

benchmark-check:
	npm run benchmark:check

clean:
	rm -rf dist

version:
	@node -p 'require("./package.json").version'

patch minor major:
	npm version $@ --no-git-tag-version
