import requests
import uuid

BASE_URL = "http://localhost:3000"
TIMEOUT = 30

def test_put_api_users_update_user_role_admin_only():
    # Login admin to get token
    admin_login_resp = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "ymartinez@gallo.com", "password": "admin123"},
        timeout=TIMEOUT,
    )
    assert admin_login_resp.status_code == 200
    admin_token = admin_login_resp.json().get("token")
    assert admin_token

    headers = {"Authorization": f"Bearer {admin_token}"}

    # Create a new user to update
    unique_email = f"testuser-{uuid.uuid4()}@example.com"
    create_resp = requests.post(
        f"{BASE_URL}/api/users",
        json={
            "name": "Test User",
            "email": unique_email,
            "password": "pass1234",
            "role": "operator"
        },
        headers=headers,
        timeout=TIMEOUT,
    )
    assert create_resp.status_code == 201
    created_user = create_resp.json()
    user_id = created_user.get("id")
    assert user_id

    try:
        # Update the user's role to "admin"
        update_resp = requests.put(
            f"{BASE_URL}/api/users/{user_id}",
            json={"role": "admin"},
            headers=headers,
            timeout=TIMEOUT,
        )
        assert update_resp.status_code == 200
        updated_user = update_resp.json()
        assert updated_user.get("id") == user_id
        assert updated_user.get("role") == "admin"

        # Attempt to update non-existent user id
        non_existent_id = "00000000-0000-0000-0000-000000000000"
        update_nonexistent_resp = requests.put(
            f"{BASE_URL}/api/users/{non_existent_id}",
            json={"role": "admin"},
            headers=headers,
            timeout=TIMEOUT,
        )
        assert update_nonexistent_resp.status_code == 404
        try:
            error_message = update_nonexistent_resp.json().get("message")
        except ValueError:
            error_message = update_nonexistent_resp.text
        assert error_message and "not found" in error_message.lower()

    finally:
        # Cleanup: delete the created user
        delete_resp = requests.delete(
            f"{BASE_URL}/api/users/{user_id}",
            headers=headers,
            timeout=TIMEOUT,
        )
        assert delete_resp.status_code == 204

test_put_api_users_update_user_role_admin_only()
