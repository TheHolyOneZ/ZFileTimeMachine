use std::io::Read;

const SNIFF_BYTES: usize = 8192;


pub fn is_binary_file(path: &std::path::Path) -> std::io::Result<bool> {
    let mut file = std::fs::File::open(path)?;
    let mut buf = vec![0u8; SNIFF_BYTES];
    let n = file.read(&mut buf)?;
    Ok(is_binary_data(&buf[..n]))
}

pub fn is_binary_data(data: &[u8]) -> bool {
    let check = &data[..data.len().min(SNIFF_BYTES)];
    check.contains(&0u8)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn text_not_binary() {
        assert!(!is_binary_data(b"Hello, world!\nThis is text.\n"));
    }

    #[test]
    fn nul_byte_is_binary() {
        assert!(is_binary_data(b"Hello\x00world"));
    }
}
