import requests

BASE_URL = "http://localhost:3000"
TIMEOUT = 30

ADMIN_EMAIL = "ymartinez@gallo.com"
ADMIN_PASSWORD = "admin123"


def test_post_api_templates_create_and_delete_admin_only():
    # Helper to login and get token
    def login(email, password):
        url = f"{BASE_URL}/api/auth/login"
        resp = requests.post(url, json={"email": email, "password": password}, timeout=TIMEOUT)
        assert resp.status_code == 200, f"Login failed for {email}: {resp.text}"
        data = resp.json()
        assert "token" in data and "user" in data
        return data["token"]

    admin_token = login(ADMIN_EMAIL, ADMIN_PASSWORD)
    headers = {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}

    # We need a valid lineId for the template creation - fetch lines
    lines_resp = requests.get(f"{BASE_URL}/api/lines", headers=headers, timeout=TIMEOUT)
    assert lines_resp.status_code == 200, f"Failed to fetch lines: {lines_resp.text}"
    lines = lines_resp.json()
    assert isinstance(lines, list) and len(lines) > 0, "No production lines available"
    valid_line_id = lines[0]["id"] if "id" in lines[0] else lines[0].get("lineId") or lines[0].get("id") or None
    assert valid_line_id is not None, "No valid line ID found in lines list"

    created_template_id = None

    try:
        # Test POST /api/templates with valid data -> expect 201
        valid_template_payload = {
            "title": "Test Template for TC008",
            "lineId": valid_line_id,
            "machines": [
                {"name": "Machine A", "description": "Test machine A"},
                {"name": "Machine B", "description": "Test machine B"},
            ],
        }
        create_resp = requests.post(f"{BASE_URL}/api/templates", headers=headers, json=valid_template_payload, timeout=TIMEOUT)
        assert create_resp.status_code == 201, f"Expected 201 Created, got {create_resp.status_code}: {create_resp.text}"
        created_template = create_resp.json()
        assert "id" in created_template or "_id" in created_template, "Created template missing id"
        created_template_id = created_template.get("id") or created_template.get("_id")
        # Basic response validation
        assert created_template["title"] == valid_template_payload["title"], "Title mismatch"
        assert created_template["lineId"] == valid_template_payload["lineId"], "lineId mismatch"
        assert isinstance(created_template.get("machines"), list), "machines field missing or invalid"

        # Test POST /api/templates with missing required fields -> expect 400
        invalid_payload = {
            # Missing 'title', 'lineId', 'machines'
        }
        invalid_resp = requests.post(f"{BASE_URL}/api/templates", headers=headers, json=invalid_payload, timeout=TIMEOUT)
        assert invalid_resp.status_code == 400, f"Expected 400 Bad Request on missing fields, got {invalid_resp.status_code}"

        # Test DELETE /api/templates/:id with valid template id -> expect 204
        if created_template_id:
            delete_resp = requests.delete(f"{BASE_URL}/api/templates/{created_template_id}", headers=headers, timeout=TIMEOUT)
            assert delete_resp.status_code == 204, f"Expected 204 No Content on delete, got {delete_resp.status_code}"
            created_template_id = None  # Deleted

        # Test DELETE /api/templates/:id with non-existent id -> expect 404
        non_existent_id = "nonexistenttemplateid12345"
        delete_404_resp = requests.delete(f"{BASE_URL}/api/templates/{non_existent_id}", headers=headers, timeout=TIMEOUT)
        assert delete_404_resp.status_code == 404, f"Expected 404 Not Found for non-existent delete, got {delete_404_resp.status_code}"

    finally:
        # Cleanup if template still exists (in case delete failed above)
        if created_template_id:
            try:
                requests.delete(f"{BASE_URL}/api/templates/{created_template_id}", headers=headers, timeout=TIMEOUT)
            except Exception:
                pass


test_post_api_templates_create_and_delete_admin_only()