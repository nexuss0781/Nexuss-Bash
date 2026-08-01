from setuptools import setup, find_packages
import os

here = os.path.abspath(os.path.dirname(__file__))
with open(os.path.join(here, "README.md"), encoding="utf-8") as f:
    long_description = f.read()

setup(
    name="nexinal",
    version="2.0.0",
    author="Nexuss",
    author_email="nexuss@proton.me",
    description="CLI client for Nexuss Bash remote execution API",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/nexuss0781/Nexuss-Bash",
    packages=find_packages(),
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "Intended Audience :: System Administrators",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
        "Topic :: System :: Systems Administration",
        "Topic :: Software Development :: Build Tools",
        "Topic :: Utilities",
    ],
    entry_points={
        "console_scripts": [
            "nexinal=nexinal.cli:main",
        ],
    },
    install_requires=[
        "click>=8.0",
        "requests>=2.28",
        "pyyaml>=6.0",
        "rich>=13.0",
    ],
    python_requires=">=3.8",
    keywords="cli bash remote execution api nexuss nexinal",
    project_urls={
        "Bug Reports": "https://github.com/nexuss0781/Nexuss-Bash/issues",
        "Source": "https://github.com/nexuss0781/Nexuss-Bash",
    },
)
