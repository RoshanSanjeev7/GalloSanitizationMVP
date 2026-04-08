import requests

BASE_URL = "http://localhost:3000"
LOGIN_ENDPOINT = f"{BASE_URL}/api/auth/login"
AUTH_ME_ENDPOINT = f"{BASE_URL}/api/auth/me"
TIMEOUT = 30

def test_get_api_auth_me_with_valid_and_invalid_token():
    # Admin credentials for login
    admin_email = "ymartinez@gallo.com"
    admin_password = "admin123"

    # Step 1: Login as admin to get a valid token
    try:
        login_resp = requests.post(
            LOGIN_ENDPOINT,
            json={"email": admin_email, "password": admin_password},
            timeout=TIMEOUT
        )
        assert login_resp.status_code == 200, f"Login failed with status {login_resp.status_code}"
        login_data = login_resp.json()
        assert "token" in login_data, "Token not found in login response"
        valid_token = login_data["token"]
    except requests.RequestException as e:
        assert False, f"Exception during login request: {e}"

    headers_valid = {"Authorization": f"Bearer {valid_token}"}

    # Step 2: GET /api/auth/me with valid Bearer token
    try:
        auth_me_resp = requests.get(
            AUTH_ME_ENDPOINT,
            headers=headers_valid,
            timeout=TIMEOUT
        )
        assert auth_me_resp.status_code == 200, f"Expected 200 OK with valid token, got {auth_me_resp.status_code}"
        user_profile = auth_me_resp.json()
        # Basic validation of user profile keys
        assert isinstance(user_profile, dict), "User profile response is not a dict"
        assert "email" in user_profile and user_profile["email"] == admin_email, "Returned user profile email mismatch"
    except requests.RequestException as e:
        assert False, f"Exception during auth/me with valid token: {e}"

    # Step 3: GET /api/auth/me with invalid token
    headers_invalid_token = {"Authorization": "Bearer invalid.token.value"}
    try:
        invalid_token_resp = requests.get(
            AUTH_ME_ENDPOINT,
            headers=headers_invalid_token,
            timeout=TIMEOUT
        )
        # According to PRD: with invalid token may get 404 "User not found"
        # But often invalid token means 401, so check for those:
        assert invalid_token_resp.status_code in (401, 404), \
            f"Expected 401 or 404 for invalid token, got {invalid_token_resp.status_code}"
    except requests.RequestException as e:
        assert False, f"Exception during auth/me with invalid token: {e}"

    # Step 4: GET /api/auth/me with missing token (no Authorization header)
    try:
        missing_token_resp = requests.get(
            AUTH_ME_ENDPOINT,
            timeout=TIMEOUT
        )
        # Missing token should also trigger authorization error or 401/404
        assert missing_token_resp.status_code in (401, 404), \
            f"Expected 401 or 404 for missing token, got {missing_token_resp.status_code}"
    except requests.RequestException as e:
        assert False, f"Exception during auth/me with missing token: {e}"

test_get_api_auth_me_with_valid_and_invalid_token()