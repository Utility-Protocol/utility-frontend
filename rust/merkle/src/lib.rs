use sha2::{Digest, Sha256};
use std::slice;

static mut TREE_NODES: Vec<[u8; 32]> = Vec::new();
static mut TREE_LEVELS: Vec<usize> = Vec::new();
static mut PROOF_BUFFER: Vec<u8> = Vec::new();

#[no_mangle]
pub extern "C" fn alloc(size: usize) -> *mut u8 {
    let mut buf = Vec::with_capacity(size);
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

#[no_mangle]
pub extern "C" fn dealloc(ptr: *mut u8, size: usize) {
    unsafe {
        let _buf = Vec::from_raw_parts(ptr, 0, size);
    }
}

fn hash_node(left: &[u8; 32], right: &[u8; 32]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    if left <= right {
        hasher.update(left);
        hasher.update(right);
    } else {
        hasher.update(right);
        hasher.update(left);
    }
    let mut out = [0u8; 32];
    out.copy_from_slice(&hasher.finalize());
    out
}

#[no_mangle]
pub extern "C" fn merkle_build_tree(leaves_ptr: *const u8, len: usize) -> *const u8 {
    if len == 0 {
        return std::ptr::null();
    }

    let leaves_slice = unsafe { slice::from_raw_parts(leaves_ptr, len * 64) };
    
    let mut nodes = Vec::with_capacity(len * 2);
    let mut levels = Vec::new();
    
    // Level 0
    levels.push(0);
    for i in 0..len {
        let mut hasher = Sha256::new();
        hasher.update(&leaves_slice[i * 64..(i + 1) * 64]);
        let mut out = [0u8; 32];
        out.copy_from_slice(&hasher.finalize());
        nodes.push(out);
    }
    
    let mut current_level_start = 0;
    let mut current_level_len = len;
    
    while current_level_len > 1 {
        let next_level_start = nodes.len();
        levels.push(next_level_start);
        
        for i in (0..current_level_len).step_by(2) {
            let left = &nodes[current_level_start + i];
            let right = if i + 1 < current_level_len {
                &nodes[current_level_start + i + 1]
            } else {
                left // Duplicate last node if odd
            };
            nodes.push(hash_node(left, right));
        }
        
        current_level_start = next_level_start;
        current_level_len = nodes.len() - next_level_start;
    }
    
    unsafe {
        TREE_NODES = nodes;
        TREE_LEVELS = levels;
        TREE_NODES.last().unwrap().as_ptr()
    }
}

#[no_mangle]
pub extern "C" fn merkle_generate_proof(leaf_index: usize) -> *const u8 {
    unsafe {
        PROOF_BUFFER.clear();
        PROOF_BUFFER.extend_from_slice(&[0, 0, 0, 0]); // Placeholder for length
        
        if TREE_LEVELS.is_empty() {
            return PROOF_BUFFER.as_ptr();
        }

        let mut current_idx = leaf_index;
        let mut proof_len = 0u32;
        
        for level in 0..TREE_LEVELS.len() - 1 {
            let level_start = TREE_LEVELS[level];
            let level_len = if level + 1 < TREE_LEVELS.len() {
                TREE_LEVELS[level + 1] - level_start
            } else {
                1
            };
            
            let sibling_idx = if current_idx % 2 == 0 {
                if current_idx + 1 < level_len { current_idx + 1 } else { current_idx }
            } else {
                current_idx - 1
            };
            
            if current_idx != sibling_idx { // Only push if not paired with itself at odd edge
                PROOF_BUFFER.extend_from_slice(&TREE_NODES[level_start + sibling_idx]);
                proof_len += 1;
            } else {
                // If it is an odd edge, it hashes with itself. We do push it because
                // the verifier needs to know it. Actually, wait.
                // If it hashes with itself, the verifier needs the sibling.
                PROOF_BUFFER.extend_from_slice(&TREE_NODES[level_start + sibling_idx]);
                proof_len += 1;
            }
            
            current_idx /= 2;
        }
        
        PROOF_BUFFER[0..4].copy_from_slice(&proof_len.to_le_bytes());
        PROOF_BUFFER.as_ptr()
    }
}

#[no_mangle]
pub extern "C" fn merkle_verify_proof(root_ptr: *const u8, proof_ptr: *const u8, leaf_ptr: *const u8) -> bool {
    let root = unsafe { slice::from_raw_parts(root_ptr, 32) };
    let leaf_data = unsafe { slice::from_raw_parts(leaf_ptr, 64) };
    
    let proof_len = unsafe { u32::from_le_bytes(slice::from_raw_parts(proof_ptr, 4).try_into().unwrap()) } as usize;
    let proof_hashes_ptr = unsafe { proof_ptr.add(4) };
    let proof = unsafe { slice::from_raw_parts(proof_hashes_ptr as *const [u8; 32], proof_len) };
    
    let mut hasher = Sha256::new();
    hasher.update(leaf_data);
    let mut current_hash = [0u8; 32];
    current_hash.copy_from_slice(&hasher.finalize());
    
    for sibling in proof {
        current_hash = hash_node(&current_hash, sibling);
    }
    
    current_hash == root
}
