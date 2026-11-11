import Foundation

let editableExtensions: Set<String> = ["md", "markdown"]
let byteOrderMark = Data([0xEF, 0xBB, 0xBF])

struct Failure: Error {
  let message: String
}

func readExactly(_ count: Int) throws -> Data {
  var data = Data()
  while data.count < count {
    guard let chunk = try FileHandle.standardInput.read(upToCount: count - data.count), !chunk.isEmpty else {
      throw Failure(message: "No message")
    }
    data.append(chunk)
  }
  return data
}

func readMessage() throws -> [String: Any] {
  let length = try readExactly(4).withUnsafeBytes { $0.loadUnaligned(as: UInt32.self) }.littleEndian
  guard let message = try JSONSerialization.jsonObject(with: readExactly(Int(length))) as? [String: Any] else {
    throw Failure(message: "Malformed message")
  }
  return message
}

func send(_ reply: [String: Any]) {
  let body = (try? JSONSerialization.data(withJSONObject: reply)) ?? Data(#"{"error":"Unencodable reply"}"#.utf8)
  var length = UInt32(body.count).littleEndian
  var frame = Data(bytes: &length, count: 4)
  frame.append(body)
  FileHandle.standardOutput.write(frame)
}

func write(path: String, text: String, base: String) throws -> [String: Any] {
  let file = URL(fileURLWithPath: path)
  guard path.hasPrefix("/"), editableExtensions.contains(file.pathExtension.lowercased()) else {
    throw Failure(message: "Only existing Markdown files can be saved")
  }
  let attributes = try FileManager.default.attributesOfItem(atPath: path)
  guard attributes[.type] as? FileAttributeType == .typeRegular else { throw Failure(message: "Not a file") }
  let raw = try Data(contentsOf: file)
  let prefix = raw.starts(with: byteOrderMark) ? byteOrderMark : Data()
  let current = raw.dropFirst(prefix.count)
  guard current == Data(base.utf8) else {
    return ["conflict": true, "text": String(decoding: current, as: UTF8.self)]
  }
  let temp = file.deletingLastPathComponent().appendingPathComponent(".\(file.lastPathComponent).v-files-\(getpid()).tmp")
  try (prefix + Data(text.utf8)).write(to: temp)
  if let permissions = attributes[.posixPermissions] {
    try FileManager.default.setAttributes([.posixPermissions: permissions], ofItemAtPath: temp.path)
  }
  guard rename(temp.path, file.path) == 0 else {
    let reason = String(cString: strerror(errno))
    try? FileManager.default.removeItem(at: temp)
    throw Failure(message: reason)
  }
  return ["ok": true]
}

do {
  let message = try readMessage()
  guard message["type"] as? String == "write",
    let path = message["path"] as? String,
    let text = message["text"] as? String,
    let base = message["base"] as? String
  else { throw Failure(message: "Unknown request") }
  send(try write(path: path, text: text, base: base))
} catch let failure as Failure {
  send(["error": failure.message])
} catch {
  send(["error": error.localizedDescription])
}
