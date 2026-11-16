"""Manage accounts from the command line (multi-user mode), e.g. when the admin password is lost.

    python -m scripts.users list
    python -m scripts.users create <username> [--admin]
    python -m scripts.users password <username>
    python -m scripts.users enable <username> | disable <username>
"""

import argparse
import getpass

from app.services import accounts


def _password() -> str:
    first = getpass.getpass("Password: ")
    if first != getpass.getpass("Repeat: "):
        raise SystemExit("The passwords do not match.")
    return first


def _user(username: str) -> accounts.User:  # type: ignore[name-defined]
    user = accounts.find_user(username)
    if user is None:
        raise SystemExit(f"No account named {username!r}")
    return user


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("list")
    create = sub.add_parser("create")
    create.add_argument("username")
    create.add_argument("--admin", action="store_true")
    for name in ("password", "enable", "disable"):
        sub.add_parser(name).add_argument("username")
    args = parser.parse_args()

    try:
        if args.command == "list":
            for user in accounts.list_users():
                flags = ", ".join(flag for flag, on in (("admin", user.is_admin), ("disabled", user.disabled)) if on)
                print(f"{user.username:<32} workspace={user.workspace}{'  [' + flags + ']' if flags else ''}")
        elif args.command == "create":
            user = accounts.create_user(args.username, _password(), is_admin=args.admin)
            print(f"Created {user.username} (workspace {user.workspace}{', admin' if user.is_admin else ''})")
        elif args.command == "password":
            accounts.update_user(_user(args.username).id, password=_password())
            print("Password changed; all sessions of this account were signed out.")
        else:
            accounts.update_user(_user(args.username).id, disabled=args.command == "disable")
            print(f"Account {args.command}d.")
    except accounts.AccountError as exc:
        raise SystemExit(str(exc)) from exc


if __name__ == "__main__":
    main()
