# Usage:
# Windows: type package_list.txt | python validate_packages.py > valid_packages.txt
# Linux/Mac: cat package_list.txt | python validate_packages.py > valid_packages.txt

import json
import sys
import urllib
import urllib.request as url_lib


def _get_pypi_package_data(package_name):
    """Fetches package metadata from PyPI JSON API.
    
    Returns the complete JSON response containing package information
    including all available releases and metadata.
    """
    json_uri = "https://pypi.org/pypi/{0}/json".format(package_name)
    # Response format: https://warehouse.readthedocs.io/api-reference/json/#project
    # Release metadata format: https://github.com/pypa/interoperability-peps/blob/master/pep-0426-core-metadata.rst
    with url_lib.urlopen(json_uri) as response:
        return json.loads(response.read())


def validate_package(package):
    """Validates if a package exists on PyPI and has multiple releases.
    
    Returns True if the package exists and has more than one version,
    False if the package doesn't exist or has insufficient releases.
    """
    try:
        data = _get_pypi_package_data(package)
        num_versions = len(data["releases"])
        return num_versions > 1
    except urllib.error.HTTPError:
        return False


if __name__ == "__main__":
    packages = sys.stdin.read().splitlines()
    valid_packages = []
    for pkg in packages:
        if validate_package(pkg):
            print(pkg)
            valid_packages.append(pkg)
