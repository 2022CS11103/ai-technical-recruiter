from setuptools import setup, find_packages

setup(
    name="ai-recruiter",
    version="0.1.0",
    packages=find_packages(),
    install_requires=[
        "pydantic>=2.0",
        "langgraph>=0.2.0",
        "langchain-core>=0.3.0",
        "httpx>=0.27",
        "tenacity>=8.0",
    ],
)
