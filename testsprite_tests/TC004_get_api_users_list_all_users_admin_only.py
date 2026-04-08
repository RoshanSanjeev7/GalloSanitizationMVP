import requests

BASE_URL = "http://localhost:3000"
TIMEOUT = 30

def test_get_api_users_list_all_users_admin_only():
    admin_email = "ymartinez@gallo.com"
    admin_password = "admin123"
    operator_email = "gsanchez@gallo.com"
    operator_password = "operator123"

    login_url = f"{BASE_URL}/api/auth/login"
    users_url = f"{BASE_URL}/api/users"

    def login(email, password):
        resp = requests.post(
            login_url,
            json={"email": email, "password": password},
            timeout=TIMEOUT
        )
        resp.raise_for_status()
        data = resp.json()
        assert "token" in data and "user" in data
        return data["token"], data["user"]

    # Login as admin and get token
    admin_token, admin_user = login(admin_email, admin_password)

    # Login as operator and get token
    operator_token, operator_user = login(operator_email, operator_password)

    headers_admin = {"Authorization": f"Bearer {admin_token}"}
    headers_operator = {"Authorization": f"Bearer {operator_token}"}

    # Admin: GET /api/users should return 200 with list of users excluding passwords
    resp = requests.get(users_url, headers=headers_admin, timeout=TIMEOUT)
    assert resp.status_code == 200
    users_list = resp.json()
    assert isinstance(users_list, list)
    # Each user should be a dict and must not include "password"
    for user in users_list:
        assert isinstance(user, dict)
        assert "password" not in user

    # Operator: GET /api/users should return 403 Forbidden (admin only)
    resp = requests.get(users_url, headers=headers_operator, timeout=TIMEOUT)
    assert resp.status_code == 403

    # No token: GET /api/users should return 401 Unauthorized
    resp = requests.get(users_url, timeout=TIMEOUT)
    assert resp.status_code == 401

test_get_api_users_list_all_users_admin_only()
