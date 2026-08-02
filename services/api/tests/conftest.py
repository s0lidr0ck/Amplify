"""Shared fixtures.

The RSA pairs are generated once per session rather than per test: key
generation is slow enough to be felt, and nothing here needs a fresh one.
"""

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from jose import jwk


def _make_pair(kid: str) -> tuple[str, dict]:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    public_pem = (
        key.public_key()
        .public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        .decode()
    )
    public_jwk = jwk.construct(public_pem, algorithm="RS256").to_dict()
    # to_dict gives bytes for n/e; the JWKS the hub publishes is JSON strings.
    public_jwk = {
        k: (v.decode() if isinstance(v, bytes) else v) for k, v in public_jwk.items()
    }
    public_jwk.update({"kid": kid, "alg": "RS256", "use": "sig"})
    return private_pem, public_jwk


@pytest.fixture(scope="session")
def rsa_keypair() -> tuple[str, dict]:
    """The key the fake hub signs with."""
    return _make_pair("test-key")


@pytest.fixture(scope="session")
def other_keypair() -> tuple[str, dict]:
    """A key the hub never published — used to forge tokens."""
    return _make_pair("other-key")
