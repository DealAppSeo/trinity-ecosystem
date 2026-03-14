use warp::Filter;
use serde_json::json;

#[tokio::main]
async fn main() {
    let port = std::env::var("PORT")
        .unwrap_or_else(|_| "8080".to_string())
        .parse()
        .expect("PORT must be a number");

    let route = warp::path!("health").map(|| {
        warp::reply::json(&json!({
            "status": "online",
            "service": "rust-brain",
            "phase": "Solana StableHacks Integration Pending"
        }))
    });

    println!("🦀 rust-brain listening on port {}", port);
    warp::serve(route).run(([0, 0, 0, 0], port)).await;
}
