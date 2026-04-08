import requests

BASE_URL = "http://localhost:3000"
ADMIN_EMAIL = "ymartinez@gallo.com"
ADMIN_PASSWORD = "admin123"
TIMEOUT = 30

def test_get_api_templates_list_and_get_by_id_authenticated():
    session = requests.Session()
    # Login as admin to get token
    login_resp = session.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=TIMEOUT
    )
    assert login_resp.status_code == 200, f"Login failed with status {login_resp.status_code}"
    login_data = login_resp.json()
    token = login_data.get("token")
    assert token, "Token not found in login response"
    headers = {"Authorization": f"Bearer {token}"}

    # GET /api/templates list all templates
    list_resp = session.get(f"{BASE_URL}/api/templates", headers=headers, timeout=TIMEOUT)
    assert list_resp.status_code == 200, f"Templates list failed with status {list_resp.status_code}"
    templates = list_resp.json()
    assert isinstance(templates, list), "Templates response is not a list"

    if templates:
        existing_id = templates[0].get("id") or templates[0].get("_id") or templates[0].get("templateId")
    else:
        # No templates exist, create one for test
        create_payload = {
            "title": "Test Template for TC009",
            "lineId": "line91",  # Using a plausible lineId as string
            "machines": []
        }
        create_resp = session.post(f"{BASE_URL}/api/templates", headers=headers, json=create_payload, timeout=TIMEOUT)
        assert create_resp.status_code == 201, f"Template creation failed with status {create_resp.status_code}"
        created_template = create_resp.json()
        existing_id = created_template.get("id") or created_template.get("_id") or created_template.get("templateId")

        try:
            # GET /api/templates/:id with existing id should return 200
            get_by_id_resp = session.get(f"{BASE_URL}/api/templates/{existing_id}", headers=headers, timeout=TIMEOUT)
            assert get_by_id_resp.status_code == 200, f"GET existing template by id failed with status {get_by_id_resp.status_code}"
            tmpl = get_by_id_resp.json()
            assert tmpl.get("id") == existing_id or tmpl.get("_id") == existing_id, "Returned template id mismatch"

            # GET /api/templates/:id with unknown id should return 404
            unknown_id = "00000000-0000-0000-0000-000000000000"
            unknown_resp = session.get(f"{BASE_URL}/api/templates/{unknown_id}", headers=headers, timeout=TIMEOUT)
            assert unknown_resp.status_code == 404, f"GET unknown template id should return 404 but got {unknown_resp.status_code}"
        finally:
            # Clean up created template
            del_resp = session.delete(f"{BASE_URL}/api/templates/{existing_id}", headers=headers, timeout=TIMEOUT)
            # Accept 204 No Content or 200 OK for deletion success depending on API behavior
            assert del_resp.status_code in (200, 204), f"Cleanup delete template failed with status {del_resp.status_code}"
    if templates:
        # We already have an existing template, test GET by existing id
        get_by_id_resp = session.get(f"{BASE_URL}/api/templates/{existing_id}", headers=headers, timeout=TIMEOUT)
        assert get_by_id_resp.status_code == 200, f"GET existing template by id failed with status {get_by_id_resp.status_code}"
        tmpl = get_by_id_resp.json()
        assert tmpl.get("id") == existing_id or tmpl.get("_id") == existing_id, "Returned template id mismatch"

        # Test GET by unknown id returns 404
        unknown_id = "00000000-0000-0000-0000-000000000000"
        unknown_resp = session.get(f"{BASE_URL}/api/templates/{unknown_id}", headers=headers, timeout=TIMEOUT)
        assert unknown_resp.status_code == 404, f"GET unknown template id should return 404 but got {unknown_resp.status_code}"

test_get_api_templates_list_and_get_by_id_authenticated()