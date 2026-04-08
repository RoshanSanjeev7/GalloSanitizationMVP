import requests

BASE_URL = "http://localhost:3000"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
LINES_URL = f"{BASE_URL}/api/lines"
TIMEOUT = 30

ADMIN_EMAIL = "ymartinez@gallo.com"
ADMIN_PASSWORD = "admin123"


def test_get_api_lines_list_production_lines_authenticated():
    # Helper function to login and return token
    def login(email, password):
        res = requests.post(
            LOGIN_URL,
            json={"email": email, "password": password},
            timeout=TIMEOUT,
        )
        res.raise_for_status()
        data = res.json()
        return data.get("token")

    # Acquire valid admin token
    token = login(ADMIN_EMAIL, ADMIN_PASSWORD)
    assert token and isinstance(token, str), "Failed to get token with valid admin credentials"

    headers_valid = {"Authorization": f"Bearer {token}"}

    # 1) Test GET /api/lines with valid token - expect 200 and list response
    response_valid = requests.get(LINES_URL, headers=headers_valid, timeout=TIMEOUT)
    assert response_valid.status_code == 200, f"Expected 200 OK, got {response_valid.status_code}"
    json_data = response_valid.json()
    assert isinstance(json_data, list), "Response should be a list of production lines"

    # 2) Test GET /api/lines without token - expect 401 Unauthorized
    response_no_token = requests.get(LINES_URL, timeout=TIMEOUT)
    assert response_no_token.status_code == 401, f"Expected 401 Unauthorized without token, got {response_no_token.status_code}"

    # 3) Test GET /api/lines with invalid token - expect 401 Unauthorized
    headers_invalid = {"Authorization": "Bearer invalidtoken123"}
    response_invalid = requests.get(LINES_URL, headers=headers_invalid, timeout=TIMEOUT)
    assert response_invalid.status_code == 401, f"Expected 401 Unauthorized with invalid token, got {response_invalid.status_code}"


test_get_api_lines_list_production_lines_authenticated()