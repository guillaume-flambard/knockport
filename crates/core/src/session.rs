use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ContactPayload {
    pub name: String,
    pub email: String,
    pub message: String,
}
