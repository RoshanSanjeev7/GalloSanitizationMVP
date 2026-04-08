import requests
import uuid

BASE_URL = "http://localhost:3000"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
USERS_URL = f"{BASE_URL}/api/users"
TIMEOUT = 30

ADMIN_EMAIL = "ymartinez@gallo.com"
ADMIN_PASSWORD = "admin123"

def get_admin_token():
    resp = requests.post(
        LOGIN_URL,
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=TIMEOUT
    )
    resp.raise_for_status()
    return resp.json()["token"]

def create_user(admin_token, user_email):
    user_data = {
        "name": "Test User",
        "email": user_email,
        "password": "TestPass123!",
        "role": "operator"
    }
    headers = {"Authorization": f"Bearer {admin_token}"}
    resp = requests.post(USERS_URL, json=user_data, headers=headers, timeout=TIMEOUT)
    resp.raise_for_status()
    return resp.json()

def delete_user(admin_token, user_id):
    headers = {"Authorization": f"Bearer {admin_token}"}
    return requests.delete(f"{USERS_URL}/{user_id}", headers=headers, timeout=TIMEOUT)

def test_tc006_delete_api_users_delete_user_admin_only():
    admin_token = get_admin_token()
    headers = {"Authorization": f"Bearer {admin_token}"}

    # Create a user to delete in the test
    unique_email = f"testuser_{uuid.uuid4()}@example.com"
    created_user = create_user(admin_token, unique_email)
    user_id = created_user["id"]

    try:
        # Delete the created user - expect 204 No Content
        delete_resp = delete_user(admin_token, user_id)
        assert delete_resp.status_code == 204, f"Expected 204, got {delete_resp.status_code}"

        # Trying to delete the same user again should return 404 Not Found
        delete_resp_2 = delete_user(admin_token, user_id)
        assert delete_resp_2.status_code == 404, f"Expected 404, got {delete_resp_2.status_code}"

        # Delete a user with a non-existent user id - expect 404 Not Found
        non_existent_id = str(uuid.uuid4())
        delete_resp_3 = delete_user(admin_token, non_existent_id)
        assert delete_resp_3.status_code == 404, f"Expected 404, got {delete_resp_3.status_code}"

    finally:
        # Cleanup if user still exists (in case delete in try failed)
        resp_check = requests.get(f"{USERS_URL}/{user_id}", headers=headers, timeout=TIMEOUT)
        if resp_check.status_code == 200:
            requests.delete(f"{USERS_URL}/{user_id}", headers=headers, timeout=TIMEOUT)

test_tc006_delete_api_users_delete_user_admin_only()