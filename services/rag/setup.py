from setuptools import setup, find_packages

setup(
    name="rag-service",
    version="0.1.0",
    packages=find_packages(),
    install_requires=["pydantic>=2.0", "numpy>=1.26", "httpx>=0.27"],
)
