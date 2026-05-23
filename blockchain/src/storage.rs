use crate::block::Block;
use serde_json::Error as SerdeError;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum StorageError {
    #[error("sled error")]
    Sled(#[from] sled::Error),
    #[error("serialization error")]
    Serde(#[from] SerdeError),
}

#[derive(Clone)]
pub struct BlockStorage {
    db: sled::Db,
}

impl BlockStorage {
    pub fn open(path: &str) -> Result<Self, StorageError> {
        let db = sled::open(path)?;
        Ok(Self { db })
    }

    pub fn append_block(&self, block: &Block) -> Result<(), StorageError> {
        let key = block.index.to_be_bytes();
        let value = serde_json::to_vec(block)?;
        self.db.insert(key, value)?;
        self.db.flush()?;
        Ok(())
    }

    #[allow(dead_code)]
    pub fn get_block(&self, index: u64) -> Result<Option<Block>, StorageError> {
        let key = index.to_be_bytes();
        match self.db.get(key)? {
            Some(val) => Ok(Some(serde_json::from_slice(&val)?)),
            None => Ok(None),
        }
    }

    pub fn all_blocks(&self) -> Result<Vec<Block>, StorageError> {
        let mut blocks = Vec::new();
        for entry in self.db.iter() {
            let (_k, v) = entry?;
            blocks.push(serde_json::from_slice::<Block>(&v)?);
        }
        blocks.sort_by_key(|b| b.index);
        Ok(blocks)
    }

    pub fn paginated_blocks(&self, page: usize, limit: usize) -> Result<Vec<Block>, StorageError> {
        let all = self.all_blocks()?;
        let safe_page = page.max(1);
        let safe_limit = limit.max(1);
        let start = (safe_page - 1) * safe_limit;
        Ok(all.into_iter().skip(start).take(safe_limit).collect())
    }

    #[allow(dead_code)]
    pub fn height(&self) -> Result<u64, StorageError> {
        let count = self.db.len();
        if count == 0 {
            Ok(0)
        } else {
            Ok((count - 1) as u64)
        }
    }
}
