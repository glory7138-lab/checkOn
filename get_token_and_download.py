import subprocess
import os
import sys

def get_token():
    input_data = "protocol=https\nhost=github.com\n\n"
    try:
        p = subprocess.Popen(
            ['git', 'credential', 'fill'],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        stdout, stderr = p.communicate(input=input_data)
        for line in stdout.splitlines():
            if line.startswith("password="):
                return line.split("password=")[1]
    except Exception:
        pass
    return None

def main():
    token = get_token()
    env = os.environ.copy()
    if token:
        env["GITHUB_TOKEN"] = token
        print("Successfully retrieved GitHub Token from Git Credentials.")
    else:
        print("[WARNING] Could not retrieve GITHUB_TOKEN from git credential helper. Trying without auth...")

    cmd = ["gh", "release", "download", "latest", "-p", "gospel_app.tar*", "--dir", "nas_deploy", "--clobber"]
    try:
        print("Running: " + " ".join(cmd))
        result = subprocess.run(cmd, env=env, check=True)
        print("Download completed successfully.")
        sys.exit(0)
    except subprocess.CalledProcessError as e:
        print(f"[ERROR] gh command failed with exit code {e.returncode}")
        sys.exit(e.returncode)
    except Exception as e:
        print(f"[ERROR] Failed to run gh: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
