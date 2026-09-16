from setuptools import setup, find_packages

setup(
    name="voice-service",
    version="0.1.0",
    packages=find_packages(),
    install_requires=["pydantic>=2.0", "httpx>=0.27", "edge-tts>=6.0"],
)
