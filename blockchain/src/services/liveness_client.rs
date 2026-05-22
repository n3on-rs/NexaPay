use reqwest::multipart;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::env;

#[derive(Deserialize, Serialize, Debug)]
pub struct LivenessResponse {
    pub passed: bool,
    pub stage_failed: Option<String>,
    pub similarity_score: Option<f64>,
    pub motion_peaks: Option<i32>,
    pub error: Option<String>,
}

pub struct LivenessClient {
    client: Client,
    url: String,
}

impl LivenessClient {
    pub fn new() -> Self {
        let url = env::var("LIVENESS_SERVICE_URL")
            .unwrap_or_else(|_| "http://localhost:5001".to_string());
        Self {
            client: Client::new(),
            url,
        }
    }

    pub async fn analyze(
        &self,
        cin_front_path: &str,
        liveness_video_path: &str,
    ) -> Result<LivenessResponse, Box<dyn std::error::Error + Send + Sync>> {
        let app_env = env::var("NEXAPAY_ENV")
            .or_else(|_| env::var("APP_ENV"))
            .unwrap_or_default();
        let is_production = app_env == "production" || app_env == "prod";
        let is_demo = app_env == "demo";

        // Demo mode: simulate realistic liveness scan with a delay
        if is_demo && env::var("LIVENESS_MOCK_PASS").ok().as_deref() != Some("false") {
            let _ = (cin_front_path, liveness_video_path);
            // Simulate realistic processing time (2-3 seconds)
            tokio::time::sleep(std::time::Duration::from_millis(2500)).await;
            return Ok(LivenessResponse {
                passed: true,
                stage_failed: None,
                similarity_score: Some(0.94),
                motion_peaks: Some(3),
                error: None,
            });
        }

        // Dev/sandbox only: instant mock pass
        if !is_production && env::var("LIVENESS_MOCK_PASS").ok().as_deref() == Some("true") {
            if is_production {
                return Err("LIVENESS_MOCK_PASS is forbidden in production".into());
            }
            let _ = (cin_front_path, liveness_video_path);
            return Ok(LivenessResponse {
                passed: true,
                stage_failed: None,
                similarity_score: Some(1.0),
                motion_peaks: Some(3),
                error: None,
            });
        }

        let cin_bytes = tokio::fs::read(cin_front_path).await?;
        let live_bytes = tokio::fs::read(liveness_video_path).await?;

        let form = multipart::Form::new()
            .part(
                "cin_front",
                multipart::Part::bytes(cin_bytes).file_name("cin_front.jpg"),
            )
            .part(
                "liveness_video",
                multipart::Part::bytes(live_bytes).file_name("liveness.mp4"),
            );

        let resp = self
            .client
            .post(format!("{}/liveness/analyze", self.url))
            .multipart(form)
            .send()
            .await?;

        let status = resp.status();
        let body = resp.text().await?;
        if !status.is_success() {
            // Try parse JSON error
            let parsed: serde_json::Value = serde_json::from_str(&body).unwrap_or_default();
            return Ok(LivenessResponse {
                passed: false,
                stage_failed: parsed
                    .get("stage_failed")
                    .and_then(|v| v.as_str().map(|s| s.to_string())),
                similarity_score: parsed.get("similarity_score").and_then(|v| v.as_f64()),
                motion_peaks: parsed
                    .get("motion_peaks")
                    .and_then(|v| v.as_i64().map(|i| i as i32)),
                error: parsed
                    .get("error")
                    .and_then(|v| v.as_str().map(|s| s.to_string())),
            });
        }

        let parsed: LivenessResponse = serde_json::from_str(&body)?;
        Ok(parsed)
    }
}
