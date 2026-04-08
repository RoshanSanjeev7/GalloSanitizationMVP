import requests
import uuid

BASE_URL = "http://localhost:3000"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
USERS_URL = f"{BASE_URL}/api/users"
TIMEOUT = 30

def login(email: str, password: str):
    resp = requests.post(LOGIN_URL, json={"email": email, "password": password}, timeout=TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    assert "token" in data and "user" in data
    return data["token"], data["user"]

def create_user(token: str, user_data: dict):
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.post(USERS_URL, json=user_data, headers=headers, timeout=TIMEOUT)
    return resp

def delete_user(token: str, user_id: str):
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.delete(f"{USERS_URL}/{user_id}", headers=headers, timeout=TIMEOUT)
    return resp

def test_post_api_users_create_user_admin_only():
    admin_email = "ymartinez@gallo.com"
    admin_password = "admin123"
    operator_email = "gsanchez@gallo.com"
    operator_password = "operator123"

    # Login as admin and operator to get tokens
    admin_token, _ = login(admin_email, admin_password)
    operator_token, _ = login(operator_email, operator_password)

    # Prepare valid user data
    unique_email = f"testuser{uuid.uuid4().hex}@example.com"
    valid_user_data = {
        "name": "Test User",
        "email": unique_email,
        "password": "TestPass123!",
        "role": "operator"
    }
    headers_admin = {"Authorization": f"Bearer {admin_token}"}
    user_id = None

    try:
        # 1. Create user with admin token and valid data -> Expect 201
        resp = create_user(admin_token, valid_user_data)
        assert resp.status_code == 201, f"Expected 201, got {resp.status_code}"
        user_created = resp.json()
        assert "id" in user_created or "_id" in user_created or "email" in user_created
        if "id" in user_created:
            user_id = user_created["id"]
        elif "_id" in user_created:
            user_id = user_created["_id"]
        else:
            user_id = user_created.get("email")  # fallback, though unusual

        # 2. Create user with missing required fields -> Expect 400
        incomplete_data = {"name": "User Without Email"}
        resp = create_user(admin_token, incomplete_data)
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}"
        assert "Missing required fields" in resp.text or "missing" in resp.text.lower()

        # 3. Create user with duplicate email -> Expect 409
        resp = create_user(admin_token, valid_user_data)
        assert resp.status_code == 409, f"Expected 409, got {resp.status_code}"
        assert "Email already exists" in resp.text or "email already exists" in resp.text.lower()

        # 4. Create user with operator token -> Expect 403 Forbidden
        another_user_data = {
            "name": "Operator Create Attempt",
            "email": f"opcreate{uuid.uuid4().hex}@example.com",
            "password": "password123",
            "role": "operator"
        }
        headers_operator = {"Authorization": f"Bearer {operator_token}"}
        resp = create_user(operator_token, another_user_data)
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"
        assert "Forbidden" in resp.text or "forbidden" in resp.text.lower()

    finally:
        # Cleanup: delete the user created for testing if exists
        if user_id:
            del_resp = delete_user(admin_token, user_id)
            # It might return 204 or 404 if already deleted, allow both
            assert del_resp.status_code in (204, 404)

test_post_api_users_create_user_admin_only()