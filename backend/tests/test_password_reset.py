def test_reset_response_is_uniform_and_token_is_single_use(api):
    client, headers, _ = api
    known = client.post("/api/v1/auth/password-resets", json={"email": "CUSTOMER@example.test"})
    unknown = client.post("/api/v1/auth/password-resets", json={"email": "unknown@example.test"})
    assert known.status_code == unknown.status_code == 202
    assert known.json() == unknown.json()
    assert client.get("/api/v1/outbox", headers=headers["staff"]).status_code == 403
    entries = client.get("/api/v1/outbox", headers=headers["admin"]).json()["data"]
    assert len(entries) == 1
    entry = client.get(f"/api/v1/outbox/{entries[0]['id']}", headers=headers["admin"]).json()
    assert entry["recipient"] == "customer@example.test"
    body = {"token": entry["detail"]["token"], "new_password": "ChangedPassword!2"}
    assert client.post("/api/v1/auth/password-resets/confirm", json=body).status_code == 200
    assert client.post("/api/v1/auth/password-resets/confirm", json=body).status_code == 400
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": "customer@example.test", "password": "ValidPassword!1"},
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": "customer@example.test", "password": "ChangedPassword!2"},
        ).status_code
        == 200
    )


def test_public_registration_cannot_assign_roles_or_accept_invalid_email(api):
    client, _, _ = api
    assert (
        client.post(
            "/api/v1/auth/register",
            json={"name": "Bad email", "email": "not-email", "password": "ValidPassword!1"},
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/v1/auth/register",
            json={
                "name": "Injected role",
                "email": "new@example.test",
                "password": "ValidPassword!1",
                "role": "admin",
            },
        ).status_code
        == 422
    )


def test_password_strength_accepts_unicode_letters_but_not_space_as_special(api):
    client, _, _ = api
    assert (
        client.post(
            "/api/v1/auth/register",
            json={"name": "Weak", "email": "weak-space@example.test", "password": "Upperlower "},
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/v1/auth/register",
            json={"name": "Unicode", "email": "unicode@example.test", "password": "Ääpassword!1"},
        ).status_code
        == 201
    )
    assert (
        client.post(
            "/api/v1/auth/login", json={"email": "unicode@example.test", "password": "Ääpassword!1"}
        ).status_code
        == 200
    )
