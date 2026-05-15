use axum::{extract::State, Json, response::IntoResponse};
use sqlx::Row;
use crate::api::AppState;

pub async fn list_applications(State(state): State<AppState>, axum::extract::Query(q): axum::extract::Query<std::collections::HashMap<String,String>>) -> impl IntoResponse {
    let status = q.get("status").cloned().unwrap_or_else(|| "UNDER_REVIEW".to_string());
    let rows = sqlx::query("SELECT id, user_address, business_name, status, risk_score FROM agent_applications WHERE status=$1")
        .bind(status)
        .fetch_all(&state.pg_pool)
        .await
        .unwrap_or_default();
    let items: Vec<serde_json::Value> = rows
        .into_iter()
        .map(|r| {
            let id: String = r.try_get("id").unwrap_or_default();
            let user_address: String = r.try_get("user_address").unwrap_or_default();
            let business_name: String = r.try_get("business_name").unwrap_or_default();
            let status: String = r.try_get("status").unwrap_or_default();
            let risk_score: f64 = r.try_get("risk_score").unwrap_or(0.0);
            serde_json::json!({"id": id, "user_address": user_address, "business_name": business_name, "status": status, "risk_score": risk_score})
        })
        .collect();
    (axum::http::StatusCode::OK, Json(serde_json::json!(items)))
}

pub async fn get_application(State(state): State<AppState>, axum::extract::Path(id): axum::extract::Path<String>) -> impl IntoResponse {
    let row = sqlx::query("SELECT id, user_address, business_name, status, risk_score, reviewer_notes FROM agent_applications WHERE id=$1")
        .bind(id)
        .fetch_optional(&state.pg_pool)
        .await
        .unwrap_or(None);
    match row {
        Some(r) => {
            let id: String = r.try_get("id").unwrap_or_default();
            let user_address: String = r.try_get("user_address").unwrap_or_default();
            let business_name: String = r.try_get("business_name").unwrap_or_default();
            let status: String = r.try_get("status").unwrap_or_default();
            let risk_score: f64 = r.try_get("risk_score").unwrap_or(0.0);
            let reviewer_notes: Option<String> = r.try_get("reviewer_notes").ok();
            (axum::http::StatusCode::OK, Json(serde_json::json!({"id": id, "user_address": user_address, "business_name": business_name, "status": status, "risk_score": risk_score, "reviewer_notes": reviewer_notes})))
        }
        None => (axum::http::StatusCode::NOT_FOUND, Json(serde_json::json!({"error":"not_found"})))
    }
}

pub async fn approve(State(state): State<AppState>, axum::extract::Path(id): axum::extract::Path<String>, Json(body): Json<serde_json::Value>) -> impl IntoResponse {
    let notes = body.get("reviewer_notes").and_then(|v| v.as_str()).unwrap_or("");
    let _ = sqlx::query("UPDATE agent_applications SET status='APPROVED', reviewer_notes=$1, reviewed_at=NOW() WHERE id=$2").bind(notes).bind(id).execute(&state.pg_pool).await;
    (axum::http::StatusCode::OK, Json(serde_json::json!({"status":"APPROVED"})))
}

pub async fn reject(State(state): State<AppState>, axum::extract::Path(id): axum::extract::Path<String>, Json(body): Json<serde_json::Value>) -> impl IntoResponse {
    let reason = body.get("rejection_reason").and_then(|v| v.as_str()).unwrap_or("Rejected by admin");
    let _ = sqlx::query("UPDATE agent_applications SET status='REJECTED', rejection_reason=$1, reviewed_at=NOW() WHERE id=$2").bind(reason).bind(id).execute(&state.pg_pool).await;
    (axum::http::StatusCode::OK, Json(serde_json::json!({"status":"REJECTED"})))
}

pub async fn process_withdrawal(State(state): State<AppState>, axum::extract::Path(id): axum::extract::Path<String>, Json(body): Json<serde_json::Value>) -> impl IntoResponse {
    let action = body.get("action").and_then(|v| v.as_str()).unwrap_or("");
    if action=="COMPLETE" {
        let _ = sqlx::query("UPDATE bank_withdrawals SET status='COMPLETED', processed_at=NOW() WHERE id=$1").bind(id).execute(&state.pg_pool).await;
        // TODO: create blockchain tx to release escrow
        return (axum::http::StatusCode::OK, Json(serde_json::json!({"status":"COMPLETED"})))
    }
    if action=="REJECT" {
        let reason = body.get("rejection_reason").and_then(|v| v.as_str()).unwrap_or("");
        let _ = sqlx::query("UPDATE bank_withdrawals SET status='REJECTED', rejection_reason=$1, processed_at=NOW() WHERE id=$2").bind(reason).bind(id).execute(&state.pg_pool).await;
        return (axum::http::StatusCode::OK, Json(serde_json::json!({"status":"REJECTED"})))
    }
    (axum::http::StatusCode::BAD_REQUEST, Json(serde_json::json!({"error":"invalid_action"})))
}
