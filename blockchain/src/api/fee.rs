use sqlx::PgPool;
use sqlx::Row;

#[derive(Debug, Clone)]
pub struct FeeBracket {
    pub min_amount_millimes: i64,
    pub max_amount_millimes: Option<i64>,
    pub flat_fee_millimes: i32,
    pub rate_bps: i32, // basis points: 250 = 2.5%
    pub min_fee_millimes: i32,
    pub max_fee_millimes: Option<i32>,
}

pub async fn fetch_brackets(pool: &PgPool, fee_type: &str) -> Result<Vec<FeeBracket>, sqlx::Error> {
    let rows = sqlx::query(
        "SELECT min_amount_millimes, max_amount_millimes, flat_fee_millimes, rate_bps, min_fee_millimes, max_fee_millimes
         FROM fee_brackets
         WHERE fee_type = $1 AND active = true
         ORDER BY priority ASC, min_amount_millimes ASC",
    )
    .bind(fee_type)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| FeeBracket {
            min_amount_millimes: r.try_get::<i64, _>("min_amount_millimes").unwrap_or(0),
            max_amount_millimes: r.try_get("max_amount_millimes").ok(),
            flat_fee_millimes: r.try_get::<i32, _>("flat_fee_millimes").unwrap_or(0),
            rate_bps: r.try_get::<i32, _>("rate_bps").unwrap_or(0),
            min_fee_millimes: r.try_get::<i32, _>("min_fee_millimes").unwrap_or(0),
            max_fee_millimes: r.try_get("max_fee_millimes").ok(),
        })
        .collect())
}

/// Calculate fee in millimes using bracket algorithm.
/// Falls back to 0 if no matching bracket (should not happen with seeded data).
pub async fn calculate_fee(pool: &PgPool, fee_type: &str, amount_millimes: i64) -> i64 {
    if amount_millimes <= 0 {
        return 0;
    }

    let brackets = match fetch_brackets(pool, fee_type).await {
        Ok(b) => b,
        Err(e) => {
            tracing::error!("Failed to fetch fee brackets for {}: {:?}", fee_type, e);
            return 0;
        }
    };

    for bracket in &brackets {
        if amount_millimes < bracket.min_amount_millimes {
            continue;
        }
        if let Some(max) = bracket.max_amount_millimes {
            if amount_millimes > max {
                continue;
            }
        }

        let pct_part = (amount_millimes as i128 * bracket.rate_bps as i128) / 10000;
        let fee = bracket.flat_fee_millimes as i128 + pct_part;
        let fee = fee.max(bracket.min_fee_millimes as i128);
        let fee = if let Some(max) = bracket.max_fee_millimes {
            fee.min(max as i128)
        } else {
            fee
        };

        return fee as i64;
    }

    0
}

/// Return a human-readable fee description for display.
pub fn describe_fee(amount_millimes: i64, fee_type: &str) -> String {
    let amount_tnd = amount_millimes as f64 / 1000.0;
    match fee_type {
        "p2p" | "gateway" => {
            if amount_tnd <= 10.0 {
                "0.500 TND".to_string()
            } else if amount_tnd <= 50.0 {
                "1.000 TND".to_string()
            } else if amount_tnd <= 200.0 {
                "2.5% + 0.300 TND".to_string()
            } else if amount_tnd <= 1000.0 {
                "2.0% + 0.500 TND".to_string()
            } else if amount_tnd <= 5000.0 {
                "1.5% + 1.000 TND".to_string()
            } else {
                "1.0% + 5.000 TND".to_string()
            }
        }
        "withdrawal" => {
            if amount_tnd <= 50.0 {
                "1.000 TND".to_string()
            } else if amount_tnd <= 200.0 {
                "1.5% + 1.000 TND".to_string()
            } else if amount_tnd <= 1000.0 {
                "1.5% + 1.000 TND (max 15 TND)".to_string()
            } else {
                "1.0% + 5.000 TND (max 50 TND)".to_string()
            }
        }
        _ => "Bracket-based fee".to_string(),
    }
}
