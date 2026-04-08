import requests

BASE_URL = "http://localhost:4000/api"
TIMEOUT = 30


def test_put_api_checklists_items_update_checklist_items():
    session = requests.Session()

    def login(email, password):
        url = f"{BASE_URL}/auth/login"
        resp = session.post(url, json={"email": email, "password": password}, timeout=TIMEOUT)
        assert resp.status_code == 200, f"Login failed for {email}, status {resp.status_code}: {resp.text}"
        data = resp.json()
        token = data.get("token")
        assert token, "No token received on login"
        return token

    # Step 1: Login as operator
    operator_token = login("gsanchez@gallo.com", "operator123")
    operator_headers = {"Authorization": f"Bearer {operator_token}"}

    # Step 2: GET /lines to get a valid lineId
    resp = session.get(f"{BASE_URL}/lines", headers=operator_headers, timeout=TIMEOUT)
    assert resp.status_code == 200, f"Failed to get lines: {resp.text}"
    lines = resp.json()
    assert isinstance(lines, list) and len(lines) > 0, "Lines list empty"
    line_id = lines[0].get("id")
    assert line_id, "First line has no id"

    checklist_id = None

    try:
        # Step 3: Create checklist as operator via POST /checklists
        resp = session.post(f"{BASE_URL}/checklists", headers=operator_headers, json={"lineId": line_id}, timeout=TIMEOUT)
        assert resp.status_code == 201, f"Failed to create checklist: {resp.text}"
        checklist = resp.json()
        checklist_id = checklist.get("id")
        assert checklist_id, "Checklist created has no id"

        # Step 4: Update machines on in_progress checklist as operator
        # We'll define some sample machines array for update
        machines_update_1 = [{"machineId": "machine_1", "status": "ok"}]
        resp = session.put(
            f"{BASE_URL}/checklists/{checklist_id}/items",
            headers=operator_headers,
            json={"machines": machines_update_1},
            timeout=TIMEOUT,
        )
        assert resp.status_code == 200, f"Operator failed to update machines: {resp.text}"
        updated_checklist = resp.json()
        # Validate updated machines array
        assert "machines" in updated_checklist, "Response missing 'machines'"
        assert updated_checklist["machines"] == machines_update_1, "Machines not updated correctly"

        # Step 5: Login as admin
        admin_token = login("ymartinez@gallo.com", "admin123")
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        # Step 6: Submit checklist via POST /checklists/:id/submit as admin
        resp = session.post(f"{BASE_URL}/checklists/{checklist_id}/submit", headers=admin_headers, timeout=TIMEOUT)
        assert resp.status_code == 200, f"Admin failed to submit checklist: {resp.text}"
        submitted_checklist = resp.json()
        assert submitted_checklist.get("status") == "submitted", "Checklist status not submitted"

        # Step 7: Admin update items on submitted checklist, expect 200
        machines_update_2 = [{"machineId": "machine_2", "status": "maintenance"}]
        resp = session.put(
            f"{BASE_URL}/checklists/{checklist_id}/items",
            headers=admin_headers,
            json={"machines": machines_update_2},
            timeout=TIMEOUT,
        )
        assert resp.status_code == 200, f"Admin failed to update machines on submitted checklist: {resp.text}"
        updated_checklist_2 = resp.json()
        assert "machines" in updated_checklist_2, "Response missing 'machines'"
        assert updated_checklist_2["machines"] == machines_update_2, "Admin machines update not reflected"

        # Step 8: Operator attempts update machines on submitted checklist, expect 400 with error message
        machines_update_3 = [{"machineId": "machine_3", "status": "error"}]
        resp = session.put(
            f"{BASE_URL}/checklists/{checklist_id}/items",
            headers=operator_headers,
            json={"machines": machines_update_3},
            timeout=TIMEOUT,
        )
        assert resp.status_code == 400, f"Operator update on submitted checklist expected 400 but got {resp.status_code}"
        error_resp = resp.json()
        error_msg = error_resp.get("error") or error_resp.get("message") or ""
        assert "Cannot update items on this checklist" in error_msg, f"Unexpected error message: {error_msg}"

        # Step 9: Update items on non-existent checklist id, expect 404
        fake_id = "000000000000000000000000"
        resp = session.put(
            f"{BASE_URL}/checklists/{fake_id}/items",
            headers=admin_headers,
            json={"machines": machines_update_1},
            timeout=TIMEOUT,
        )
        assert resp.status_code == 404, f"Updating non-existent checklist expected 404 but got {resp.status_code}"

    finally:
        # Clean up by deleting the checklist as admin if it was created
        if checklist_id:
            resp = session.delete(f"{BASE_URL}/checklists/{checklist_id}", headers=admin_headers, timeout=TIMEOUT)
            # Accept 204 No Content or 404 if already deleted
            assert resp.status_code in (204, 404), f"Failed to delete checklist in cleanup: {resp.status_code}, {resp.text}"


test_put_api_checklists_items_update_checklist_items()