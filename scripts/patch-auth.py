import re

with open('src/App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update useState(null) for user to read token
user_state = """  const [user, setUser] = useState(() => {
    try {
      const tokenStr = localStorage.getItem("auth_token");
      if (tokenStr) {
        const token = JSON.parse(atob(tokenStr));
        if (token.exp && token.exp > Date.now()) {
          return token.name;
        } else {
          localStorage.removeItem("auth_token");
          localStorage.removeItem("last_user");
        }
      }
    } catch(e) {}
    return null;
  });

  useEffect(() => {
    if (user) {
      const meId = MEMBERS.find((m) => m.name === user)?.id;
      if (meId) {
        subscribeToWebPush(meId);
      }
    }
  }, [user]);"""

content = content.replace('  const [user, setUser] = useState(null);', user_state)

# 2. Update doLogin to set auth_token
old_doLogin = """  function doLogin(name) { 
    setReservations((p) => p.map((r) => (r.owner === "나" ? { ...r, owner: name } : r))); 
    setUser(name); localStorage.setItem("last_user", name);
    setAuthOpen(false); 
    const meId = MEMBERS.find((m) => m.name === name)?.id;
    if (meId) {
      subscribeToWebPush(meId);
    }
  }"""

new_doLogin = """  function doLogin(name) { 
    setReservations((p) => p.map((r) => (r.owner === "나" ? { ...r, owner: name } : r))); 
    setUser(name); 
    localStorage.setItem("last_user", name);
    const token = { name: name, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 };
    localStorage.setItem("auth_token", btoa(JSON.stringify(token)));
    setAuthOpen(false); 
    const meId = MEMBERS.find((m) => m.name === name)?.id;
    if (meId) {
      subscribeToWebPush(meId);
    }
  }"""
content = content.replace(old_doLogin, new_doLogin)
# Just in case my previous patch had different spaces
if new_doLogin not in content:
    # Try regex
    content = re.sub(r'function doLogin\(name\).*?subscribeToWebPush\(meId\);[\s]*\}[\s]*\}', new_doLogin, content, flags=re.DOTALL)

# 3. Update Logout
old_logout = 'setUser(null); localStorage.setItem("last_user", name); if (section === "mypage" || section === "dash") setSection("book");'
new_logout = 'setUser(null); localStorage.removeItem("auth_token"); localStorage.removeItem("last_user"); if (section === "mypage" || section === "dash") setSection("book");'

# Let's just find the exact logout button
old_logout_btn = 'onClick={() => { setUser(null); localStorage.setItem("last_user", name); if (section === "mypage" || section === "dash") setSection("book"); }}'
# Actually wait, in my previous python script I did: `content.replace('setUser(name);', 'setUser(name); localStorage.setItem("last_user", name);')`
# This might have accidentally replaced `setUser(null);` ? No, because it matches `setUser(name);`.
# Let's look up how the logout is written.
# `onClick={() => { setUser(null); if (section === "mypage" || section === "dash") setSection("book"); }}`
old_logout_btn = 'onClick={() => { setUser(null); if (section === "mypage" || section === "dash") setSection("book"); }}'
new_logout_btn = 'onClick={() => { setUser(null); localStorage.removeItem("auth_token"); localStorage.removeItem("last_user"); if (section === "mypage" || section === "dash") setSection("book"); }}'
content = content.replace(old_logout_btn, new_logout_btn)


with open('src/App.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
