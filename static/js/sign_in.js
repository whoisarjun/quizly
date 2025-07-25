// Form switching
function switchToSignUp() {
    document.getElementById('signInForm').classList.add('hidden');
    document.getElementById('signUpForm').classList.remove('hidden');
    document.title = 'Quizly - Create Account';
}

function switchToSignIn() {
    document.getElementById('signUpForm').classList.add('hidden');
    document.getElementById('signInForm').classList.remove('hidden');
    document.title = 'Quizly - Sign In';
}

// Password toggle
function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    const icon = input.parentElement.querySelector('.password-toggle i');

    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

// Password strength checker
document.getElementById('signUpPassword').addEventListener('input', function() {
    const password = this.value;
    const strengthBar = document.querySelector('.strength-fill');
    const strengthText = document.querySelector('.strength-text');

    let strength = 0;
    let text = 'Weak';

    if (password.length >= 8) strength += 1;
    if (password.match(/[a-z]/)) strength += 1;
    if (password.match(/[A-Z]/)) strength += 1;
    if (password.match(/[0-9]/)) strength += 1;
    if (password.match(/[^a-zA-Z0-9]/)) strength += 1;

    const percentage = (strength / 5) * 100;
    strengthBar.style.width = percentage + '%';

    if (strength <= 2) {
        text = 'Weak';
        strengthBar.style.background = 'var(--danger)';
    } else if (strength <= 3) {
        text = 'Fair';
        strengthBar.style.background = 'var(--warning)';
    } else if (strength <= 4) {
        text = 'Good';
        strengthBar.style.background = 'var(--accent)';
    } else {
        text = 'Strong';
        strengthBar.style.background = 'var(--success)';
    }

    strengthText.textContent = text;
});

// Form submissions
document.getElementById('signInFormElement').addEventListener('submit', function(e) {
    e.preventDefault();
    // Add your sign in logic here
    console.log('Sign in form submitted');
});

document.getElementById('signUpFormElement').addEventListener('submit', function(e) {
    e.preventDefault();

    const password = document.getElementById('signUpPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (password !== confirmPassword) {
        alert('Passwords do not match');
        return;
    }

    // Add your sign up logic here
    console.log('Sign up form submitted');
});