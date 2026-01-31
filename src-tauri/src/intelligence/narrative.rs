use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
pub enum NarrativeBlockType {
    Verdict,
    Performance,
    Bottleneck,
    Tip,
    Warning,
}

#[derive(Debug, Serialize, Clone)]
pub struct NarrativeBlock {
    pub block_type: NarrativeBlockType,
    pub text: String,
    pub priority: u8,
}

pub fn compose(blocks: &mut Vec<NarrativeBlock>) -> String {
    blocks.sort_by_key(|b| b.priority);
    blocks.iter().map(|b| b.text.clone()).collect::<Vec<_>>().join("\n")
}
