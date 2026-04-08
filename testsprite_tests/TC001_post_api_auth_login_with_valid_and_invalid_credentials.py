import requests

BASE_URL = "http://localhost:3000"
LOGIN_ENDPOINT = "/api/auth/login"
TIMEOUT = 30
HEADERS = {"Content-Type": "application/json"}

def test_post_api_auth_login_with_valid_and_invalid_credentials():
    url = BASE_URL + LOGIN_ENDPOINT

    # Valid credentials (Admin)
    valid_admin_payload = {
        "email": "ymartinez@gallo.com",
        "password": "admin123"
    }
    response = requests.post(url, json=valid_admin_payload, headers=HEADERS, timeout=TIMEOUT)
    assert response.status_code == 200, f"Expected 200 for valid admin credentials, got {response.status_code}"
    json_response = response.json()
    assert "user" in json_response, "Response missing 'user' field on valid admin login"
    assert "token" in json_response, "Response missing 'token' field on valid admin login"
    assert isinstance(json_response["token"], str) and len(json_response["token"]) > 0, "Invalid token in response"

    # Valid credentials (Operator)
    valid_operator_payload = {
        "email": "gsanchez@gallo.com",
        "password": "operator123"
    }
    response = requests.post(url, json=valid_operator_payload, headers=HEADERS, timeout=TIMEOUT)
    assert response.status_code == 200, f"Expected 200 for valid operator credentials, got {response.status_code}"
    json_response = response.json()
    assert "user" in json_response, "Response missing 'user' field on valid operator login"
    assert "token" in json_response, "Response missing 'token' field on valid operator login"
    assert isinstance(json_response["token"], str) and len(json_response["token"]) > 0, "Invalid token in response"

    # Missing email
    missing_email_payload = {
        "password": "somepassword"
    }
    response = requests.post(url, json=missing_email_payload, headers=HEADERS, timeout=TIMEOUT)
    assert response.status_code == 400, f"Expected 400 for missing email, got {response.status_code}"
    text = response.text.lower()
    assert "email and password required" in text or "email" in text, f"Expected 400 error message for missing email, got: {response.text}"

    # Missing password
    missing_password_payload = {
        "email": "someone@gallo.com"
    }
    response = requests.post(url, json=missing_password_payload, headers=HEADERS, timeout=TIMEOUT)
    assert response.status_code == 400, f"Expected 400 for missing password, got {response.status_code}"
    text = response.text.lower()
    assert "email and password required" in text or "password" in text, f"Expected 400 error message for missing password, got: {response.text}"

    # Missing email and password
    empty_payload = {}
    response = requests.post(url, json=empty_payload, headers=HEADERS, timeout=TIMEOUT)
    assert response.status_code == 400, f"Expected 400 for missing email and password, got {response.status_code}"
    text = response.text.lower()
    assert "email and password required" in text, f"Expected 400 error message for missing email and password, got: {response.text}"

    # Invalid credentials
    invalid_credentials_payload = {
        "email": "invalid@gallo.com",
        "password": "wrongpassword"
    }
    response = requests.post(url, json=invalid_credentials_payload, headers=HEADERS, timeout=TIMEOUT)
    assert response.status_code == 401, f"Expected 401 for invalid credentials, got {response.status_code}"
    text = response.text.lower()
    assert "invalid credentials" in text, f"Expected 401 error message 'Invalid credentials', got: {response.text}"

test_post_api_auth_login_with_valid_and_invalid_credentials()