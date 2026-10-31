.PHONY: setup python-env dev dev-api dev-web worker test test-e2e install-browser build format format-check verify verify-all

setup python-env dev dev-api dev-web worker test test-e2e install-browser build format format-check verify verify-all:
	pyenv exec python manage.py $@
